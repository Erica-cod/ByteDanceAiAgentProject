/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const APP_URL = process.env.APP_URL || 'http://localhost:8080';
const REPEAT = Number.parseInt(process.env.REPEAT || '5', 10);
const HEADLESS = process.env.HEADLESS !== 'false';
const OUTPUT_DIR = path.resolve(process.cwd(), 'bench-results');
const INPUT_P95_BUDGET_MS = Number.parseFloat(process.env.INPUT_P95_BUDGET_MS || '100');
const NEXT_PAINT_P95_BUDGET_MS = Number.parseFloat(process.env.NEXT_PAINT_P95_BUDGET_MS || '100');
const MAX_LONG_TASK_P95_BUDGET_MS = Number.parseFloat(process.env.MAX_LONG_TASK_P95_BUDGET_MS || '50');

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function buildMarkdown(chars, idx) {
  const header = `# 大文本输入性能样本 ${idx}\n\n`;
  const line = '- [ ] 这是一个用于输入卡顿测试的 Markdown 列表项，包含中文和英文 words。\n';
  let content = header;
  while (content.length < chars) {
    content += line;
  }
  return content.slice(0, chars);
}

function getCases() {
  const raw = (process.env.CASE_SIZES || '100,5000,20000,100000').trim();
  const sizes = raw
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  return sizes.map((size, i) => ({ label: `${size}_chars`, size, content: buildMarkdown(size, i + 1) }));
}

function getCpuProfiles() {
  const raw = (process.env.CPU_PROFILES || '1').trim();
  const rates = raw
    .split(',')
    .map((s) => Number.parseFloat(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1);
  return rates.map((rate) => ({
    rate,
    label: `cpu_${rate}x`,
  }));
}

async function applyCpuThrottle(page, rate) {
  if (rate <= 1) return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
}

async function runOnce(page, content) {
  return page.evaluate(async (text) => {
    const textarea = document.querySelector('.chat-input-area__textarea');
    if (!textarea) {
      throw new Error('未找到输入框元素: .chat-input-area__textarea');
    }

    const longTasks = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTasks.push(entry.duration);
      }
    });
    observer.observe({ type: 'longtask', buffered: true });

    const cleanStart = performance.now();
    textarea.focus();
    textarea.value = '';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const cleanCostMs = performance.now() - cleanStart;

    const start = performance.now();
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    const dispatchSyncCostMs = performance.now() - start;
    await new Promise((r) => requestAnimationFrame(r));
    const nextPaintMs = performance.now() - start;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const inputDispatchCostMs = performance.now() - start;

    const settleStart = performance.now();
    await new Promise((r) => setTimeout(r, 200));
    const settleCostMs = performance.now() - settleStart;

    observer.disconnect();

    const longTaskTotalMs = longTasks.reduce((acc, n) => acc + n, 0);
    const maxLongTaskMs = longTasks.length ? Math.max(...longTasks) : 0;

    return {
      inputDispatchCostMs,
      dispatchSyncCostMs,
      nextPaintMs,
      settleCostMs,
      cleanCostMs,
      longTaskCount: longTasks.length,
      longTaskTotalMs,
      maxLongTaskMs,
    };
  }, content);
}

function summarize(rows) {
  const sortedDispatch = rows.map((r) => r.inputDispatchCostMs).sort((a, b) => a - b);
  const sortedDispatchSync = rows.map((r) => r.dispatchSyncCostMs).sort((a, b) => a - b);
  const sortedNextPaint = rows.map((r) => r.nextPaintMs).sort((a, b) => a - b);
  const sortedLongTotal = rows.map((r) => r.longTaskTotalMs).sort((a, b) => a - b);
  const sortedMaxLong = rows.map((r) => r.maxLongTaskMs).sort((a, b) => a - b);
  const sortedSettle = rows.map((r) => r.settleCostMs).sort((a, b) => a - b);

  const evaluate = {
    inputP95Pass: percentile(sortedDispatch, 95) <= INPUT_P95_BUDGET_MS,
    nextPaintP95Pass: percentile(sortedNextPaint, 95) <= NEXT_PAINT_P95_BUDGET_MS,
    maxLongTaskP95Pass: percentile(sortedMaxLong, 95) <= MAX_LONG_TASK_P95_BUDGET_MS,
  };

  return {
    runs: rows.length,
    budgets: {
      inputP95BudgetMs: INPUT_P95_BUDGET_MS,
      nextPaintP95BudgetMs: NEXT_PAINT_P95_BUDGET_MS,
      maxLongTaskP95BudgetMs: MAX_LONG_TASK_P95_BUDGET_MS,
    },
    evaluation: {
      ...evaluate,
      overallPass: evaluate.inputP95Pass && evaluate.nextPaintP95Pass && evaluate.maxLongTaskP95Pass,
    },
    inputDispatchMs: {
      p50: percentile(sortedDispatch, 50),
      p95: percentile(sortedDispatch, 95),
      max: sortedDispatch[sortedDispatch.length - 1] || 0,
    },
    dispatchSyncMs: {
      p50: percentile(sortedDispatchSync, 50),
      p95: percentile(sortedDispatchSync, 95),
      max: sortedDispatchSync[sortedDispatchSync.length - 1] || 0,
    },
    nextPaintMs: {
      p50: percentile(sortedNextPaint, 50),
      p95: percentile(sortedNextPaint, 95),
      max: sortedNextPaint[sortedNextPaint.length - 1] || 0,
    },
    settleMs: {
      p50: percentile(sortedSettle, 50),
      p95: percentile(sortedSettle, 95),
      max: sortedSettle[sortedSettle.length - 1] || 0,
    },
    longTaskTotalMs: {
      p50: percentile(sortedLongTotal, 50),
      p95: percentile(sortedLongTotal, 95),
      max: sortedLongTotal[sortedLongTotal.length - 1] || 0,
    },
    maxLongTaskMs: {
      p50: percentile(sortedMaxLong, 50),
      p95: percentile(sortedMaxLong, 95),
      max: sortedMaxLong[sortedMaxLong.length - 1] || 0,
    },
  };
}

function percentDelta(base, current) {
  if (!Number.isFinite(base) || base === 0) return 0;
  return ((current - base) / base) * 100;
}

function round(n) {
  return Number(n.toFixed(2));
}

function buildProfileComparison(profileCases) {
  const labels = Object.keys(profileCases);
  if (labels.length === 0) return {};

  const sorted = labels
    .map((label) => ({
      label,
      size: profileCases[label].sizeChars,
      summary: profileCases[label].summary,
    }))
    .sort((a, b) => a.size - b.size);

  const baseline = sorted[0];
  const output = {};
  for (const item of sorted) {
    output[item.label] = {
      sizeChars: item.size,
      deltaVsBaseline: {
        inputP95Ms: round(item.summary.inputDispatchMs.p95 - baseline.summary.inputDispatchMs.p95),
        inputP95Pct: round(percentDelta(baseline.summary.inputDispatchMs.p95, item.summary.inputDispatchMs.p95)),
        nextPaintP95Ms: round(item.summary.nextPaintMs.p95 - baseline.summary.nextPaintMs.p95),
        nextPaintP95Pct: round(percentDelta(baseline.summary.nextPaintMs.p95, item.summary.nextPaintMs.p95)),
        maxLongTaskP95Ms: round(item.summary.maxLongTaskMs.p95 - baseline.summary.maxLongTaskMs.p95),
        maxLongTaskP95Pct: round(percentDelta(baseline.summary.maxLongTaskMs.p95, item.summary.maxLongTaskMs.p95)),
      },
    };
  }
  return {
    baselineLabel: baseline.label,
    baselineSizeChars: baseline.size,
    cases: output,
  };
}

async function main() {
  const cases = getCases();
  const cpuProfiles = getCpuProfiles();
  if (cases.length === 0) {
    throw new Error('没有可用的 CASE_SIZES');
  }
  if (cpuProfiles.length === 0) {
    throw new Error('没有可用的 CPU_PROFILES');
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: HEADLESS });

  try {
    const report = {
      meta: {
        appUrl: APP_URL,
        repeat: REPEAT,
        headless: HEADLESS,
        cpuProfiles: cpuProfiles.map((p) => p.label),
        generatedAt: new Date().toISOString(),
      },
      profiles: {},
    };

    for (const profile of cpuProfiles) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForSelector('.chat-input-area__textarea', { timeout: 120000 });
      await applyCpuThrottle(page, profile.rate);

      console.log(`\n==============================`);
      console.log(`CPU 配置: ${profile.label}`);
      console.log(`==============================`);

      report.profiles[profile.label] = {
        cpuRate: profile.rate,
        cases: {},
      };

      for (const item of cases) {
        console.log(`\n== CASE ${item.label} ==`);
        const rows = [];
        for (let i = 0; i < REPEAT; i += 1) {
          const row = await runOnce(page, item.content);
          rows.push(row);
          console.log(
            `run=${i + 1}/${REPEAT} input=${row.inputDispatchCostMs.toFixed(2)}ms ` +
            `nextPaint=${row.nextPaintMs.toFixed(2)}ms longTasks=${row.longTaskCount} ` +
            `longTotal=${row.longTaskTotalMs.toFixed(2)}ms maxLong=${row.maxLongTaskMs.toFixed(2)}ms`
          );
        }

        report.profiles[profile.label].cases[item.label] = {
          sizeChars: item.size,
          summary: summarize(rows),
          raw: rows,
        };
      }
      report.profiles[profile.label].comparison = buildProfileComparison(report.profiles[profile.label].cases);

      const quick = Object.entries(report.profiles[profile.label].cases).map(([label, data]) => ({
        case: label,
        input_p95_ms: round(data.summary.inputDispatchMs.p95),
        next_p95_ms: round(data.summary.nextPaintMs.p95),
        max_long_p95_ms: round(data.summary.maxLongTaskMs.p95),
        pass: data.summary.evaluation.overallPass ? 'PASS' : 'WARN',
      }));
      console.table(quick);
      await context.close();
    }

    const outPath = path.join(OUTPUT_DIR, `input-paste-bench-${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n已输出基准报告: ${outPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('输入性能基准失败:', error);
  process.exit(1);
});
