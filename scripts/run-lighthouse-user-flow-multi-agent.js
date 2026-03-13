#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TARGET_URL = process.env.FLOW_URL || 'http://localhost:8080/?perfMock=1';
const OUT_DIR = process.env.FLOW_OUT_DIR || 'test/bench-results';
const BASENAME = `lighthouse-flow-multi-agent-${Date.now()}`;
const HTML_OUT = resolve(OUT_DIR, `${BASENAME}.html`);
const JSON_OUT = resolve(OUT_DIR, `${BASENAME}.json`);

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function loadDeps() {
  try {
    const [{ default: puppeteer }, { startFlow }] = await Promise.all([
      import('puppeteer'),
      import('lighthouse/core/index.js'),
    ]);
    return { puppeteer, startFlow };
  } catch (error) {
    console.error(
      '❌ 缺少依赖，请先安装: npm i -D lighthouse puppeteer'
    );
    throw error;
  }
}

async function run() {
  const { puppeteer, startFlow } = await loadDeps();
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();

  try {
    const flow = await startFlow(page, {
      name: 'multi-agent-history-interaction-flow',
      configContext: {
        settingsOverrides: {
          throttlingMethod: 'simulate',
          screenEmulation: { mobile: false, width: 1440, height: 900, deviceScaleFactor: 1, disabled: false },
        },
      },
    });

    await flow.navigate(TARGET_URL, { stepName: '打开带 perfMock 的聊天页' });
    await page.waitForSelector('.multi-agent-display', { timeout: 30_000 });
    await sleep(800);

    await flow.startTimespan({ stepName: '连续展开收起多 Agent 轮次并滚动' });

    for (let i = 0; i < 3; i += 1) {
      const collapseBtn = await page.$$('.multi-agent-display .control-btn');
      if (collapseBtn[1]) {
        await collapseBtn[1].click();
        await sleep(300);
      }
      const expandBtn = await page.$$('.multi-agent-display .control-btn');
      if (expandBtn[0]) {
        await expandBtn[0].click();
        await sleep(300);
      }

      const headers = await page.$$('.multi-agent-display .round-header');
      if (headers.length > 0) {
        await headers[0].click();
        await sleep(200);
        await headers[0].click();
        await sleep(200);
      }
      await page.mouse.wheel({ deltaY: 1400 });
      await sleep(250);
      await page.mouse.wheel({ deltaY: -900 });
      await sleep(250);
    }

    await flow.endTimespan();
    await flow.snapshot({ stepName: '交互结束后的页面状态快照' });

    mkdirSync(OUT_DIR, { recursive: true });
    const [htmlReport, flowResult] = await Promise.all([
      flow.generateReport(),
      flow.createFlowResult(),
    ]);

    writeFileSync(HTML_OUT, htmlReport, 'utf8');
    writeFileSync(JSON_OUT, JSON.stringify(flowResult, null, 2), 'utf8');

    console.log('✅ Lighthouse User Flow 完成');
    console.log(`- URL: ${TARGET_URL}`);
    console.log(`- HTML: ${HTML_OUT}`);
    console.log(`- JSON: ${JSON_OUT}`);
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error('❌ User Flow 执行失败:', error?.message || error);
  process.exit(1);
});
