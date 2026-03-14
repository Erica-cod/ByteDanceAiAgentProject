#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { join, resolve } from 'node:path';

const FLOW_MODE = process.env.FLOW_MODE || 'dev'; // dev | serve | static
const FLOW_PORT = Number(process.env.FLOW_PORT || (FLOW_MODE === 'serve' ? 8082 : 8080));
const TARGET_URL = process.env.FLOW_URL || `http://localhost:${FLOW_PORT}/?perfMock=1`;
const OUT_DIR = process.env.FLOW_OUT_DIR || 'test/bench-results';
const BASENAME = `lighthouse-flow-multi-agent-${Date.now()}`;
const HTML_OUT = resolve(OUT_DIR, `${BASENAME}.html`);
const JSON_OUT = resolve(OUT_DIR, `${BASENAME}.json`);
const DEBUG_SHOT_OUT = resolve(OUT_DIR, `${BASENAME}-debug.png`);
const SHOULD_BUILD = process.env.SKIP_BUILD !== 'true';
const HEADLESS = process.env.HEADLESS !== 'false';

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolveCmd, rejectCmd) => {
    const child = spawn(command, args, {
      shell: true,
      stdio: 'inherit',
      ...options,
    });
    child.on('exit', (code) => {
      if (code === 0) resolveCmd();
      else rejectCmd(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function startProcess(command, args, options = {}) {
  return spawn(command, args, {
    shell: true,
    stdio: 'inherit',
    ...options,
  });
}

async function stopProcess(child) {
  if (!child || child.killed) return;
  const pid = child.pid;
  if (!pid) return;
  await new Promise((resolveKill) => {
    const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      shell: true,
      stdio: 'ignore',
    });
    killer.on('exit', () => resolveKill());
  });
}

async function waitForServer(url, timeoutMs = 90000) {
  const target = new URL(url);
  const client = target.protocol === 'https:' ? https : http;
  const started = Date.now();
  let lastError = '';

  const probeOnce = () => new Promise((resolveProbe) => {
    const req = client.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname || '/',
        method: 'GET',
        timeout: 4000,
      },
      (res) => {
        // 服务只要能稳定返回 HTTP 响应（非 5xx），即可视作已就绪。
        const statusCode = res.statusCode ?? 0;
        res.resume();
        resolveProbe(statusCode > 0 && statusCode < 500);
      }
    );

    req.on('timeout', () => {
      lastError = 'probe timeout';
      req.destroy();
      resolveProbe(false);
    });
    req.on('error', (error) => {
      lastError = error?.message || String(error);
      resolveProbe(false);
    });
    req.end();
  });

  while (Date.now() - started < timeoutMs) {
    const ok = await probeOnce();
    if (ok) {
      return true;
    }
    await sleep(1500);
  }
  if (lastError) {
    console.warn(`[waitForServer] 最后一次探测错误: ${lastError}`);
  }
  return false;
}

function validateBuildArtifacts() {
  const htmlPath = join('dist', 'html', 'main', 'index.html');
  if (!existsSync(htmlPath)) {
    throw new Error(`构建产物缺失: ${htmlPath}`);
  }

  const html = readFileSync(htmlPath, 'utf8');
  const scriptSrcMatches = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)];
  const missing = [];

  for (const match of scriptSrcMatches) {
    const src = match[1];
    if (!src.startsWith('/static/')) continue;
    const filePath = join('dist', src.replace(/^\//, '').replace(/\//g, '\\'));
    if (!existsSync(filePath)) {
      missing.push(src);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `构建产物引用不一致，以下资源在 dist 中不存在: ${missing.join(', ')}`
    );
  }
}

function prepareStaticEntry() {
  const sourceHtmlPath = join('dist', 'html', 'main', 'index.html');
  const staticEntryPath = join('dist', 'index.html');
  if (!existsSync(sourceHtmlPath)) {
    throw new Error(`静态入口源文件缺失: ${sourceHtmlPath}`);
  }
  copyFileSync(sourceHtmlPath, staticEntryPath);
}

async function assertPagePainted(page) {
  const pageState = await page.evaluate(() => {
    const bodyText = (document.body?.innerText || '').trim();
    const root = document.querySelector('#root');
    const rootText = (root?.textContent || '').trim();
    const hasVisibleElement = Array.from(document.querySelectorAll('body *')).some((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0;
    });

    return {
      title: document.title,
      readyState: document.readyState,
      bodyTextLength: bodyText.length,
      rootTextLength: rootText.length,
      hasVisibleElement,
    };
  });

  if (pageState.bodyTextLength < 8 || !pageState.hasVisibleElement) {
    const reason = [
      '页面疑似空白，无法用于 Lighthouse 指标采集（可能触发 NO_FCP）。',
      `title=${pageState.title || '(empty)'}`,
      `readyState=${pageState.readyState}`,
      `bodyTextLength=${pageState.bodyTextLength}`,
      `rootTextLength=${pageState.rootTextLength}`,
      `hasVisibleElement=${pageState.hasVisibleElement}`,
    ].join(' ');
    throw new Error(reason);
  }
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
  let serverProcess;

  if (FLOW_MODE === 'serve' || FLOW_MODE === 'static') {
    if (SHOULD_BUILD) {
      await runCommand('npm', ['run', 'build']);
    }
    await runCommand('npm', ['run', 'preserve'], {
      env: { ...process.env, PORT: String(FLOW_PORT) },
    });
    validateBuildArtifacts();
    if (FLOW_MODE === 'serve') {
      serverProcess = startProcess('npm', ['run', 'serve'], {
        env: { ...process.env, PORT: String(FLOW_PORT), NODE_ENV: 'production' },
      });
    } else {
      prepareStaticEntry();
      serverProcess = startProcess('npx', ['http-server', 'dist', '-p', String(FLOW_PORT), '-c-1', '-g', '-b']);
    }
    const ready = await waitForServer(`http://localhost:${FLOW_PORT}/`);
    if (!ready) {
      throw new Error(`压测服务未在预期时间内启动: http://localhost:${FLOW_PORT}/`);
    }
  }

  const browser = await puppeteer.launch({
    headless: HEADLESS,
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err?.message || String(err));
  });

  try {
    const flow = await startFlow(page, {
      name: 'multi-agent-history-interaction-flow',
      configContext: {
        settingsOverrides: {
          throttlingMethod: 'simulate',
          formFactor: 'desktop',
          screenEmulation: { mobile: false, width: 1440, height: 900, deviceScaleFactor: 1, disabled: false },
        },
      },
    });

    await flow.navigate(TARGET_URL, { stepName: '打开带 perfMock 的聊天页' });
    await page.waitForSelector('#root', { timeout: 30_000 });
    await sleep(2000);
    await assertPagePainted(page);

    await flow.startTimespan({ stepName: '连续展开收起多 Agent 轮次并滚动' });

    for (let i = 0; i < 3; i += 1) {
      const summaryBtn = await page.$$('.multi-agent-summary-card button');
      if (summaryBtn.length > 0) {
        await summaryBtn[0].click();
        await sleep(300);
      }

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
    console.log(`- Headless: ${HEADLESS}`);
    console.log(`- HTML: ${HTML_OUT}`);
    console.log(`- JSON: ${JSON_OUT}`);
    if (consoleErrors.length > 0) {
      console.log(`- Console errors: ${consoleErrors.length}`);
    }
    if (pageErrors.length > 0) {
      console.log(`- Page errors: ${pageErrors.length}`);
    }
  } catch (error) {
    mkdirSync(OUT_DIR, { recursive: true });
    await page.screenshot({ path: DEBUG_SHOT_OUT, fullPage: true });
    console.error(`🧪 调试截图已保存: ${DEBUG_SHOT_OUT}`);
    if (consoleErrors.length > 0) {
      console.error('🧪 控制台错误摘要:');
      consoleErrors.slice(0, 5).forEach((item, idx) => {
        console.error(`  ${idx + 1}. ${item}`);
      });
    }
    if (pageErrors.length > 0) {
      console.error('🧪 页面异常摘要:');
      pageErrors.slice(0, 5).forEach((item, idx) => {
        console.error(`  ${idx + 1}. ${item}`);
      });
    }
    throw error;
  } finally {
    await browser.close();
    await stopProcess(serverProcess);
  }
}

run().catch((error) => {
  console.error('❌ User Flow 执行失败:', error?.message || error);
  process.exit(1);
});
