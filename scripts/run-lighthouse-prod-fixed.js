#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const DEFAULT_PORT = Number(process.env.PORT || 8082);
const ALLOW_STATIC_FALLBACK = (process.env.ALLOW_STATIC_FALLBACK || 'true') !== 'false';
const MODE = process.env.LH_MODE || 'static'; // static | serve
const OUTPUT_PATH = process.env.LH_OUTPUT_PATH || `test/bench-results/lighthouse-prod-${Date.now()}.json`;

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      ...options,
    });

    child.on('exit', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

function startProcess(command, args, options = {}) {
  return spawn(command, args, {
    stdio: 'inherit',
    shell: true,
    ...options,
  });
}

async function stopProcess(child) {
  if (!child || child.killed) return;
  const pid = child.pid;
  if (!pid) return;

  await new Promise(resolve => {
    const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      shell: true,
    });
    killer.on('exit', () => resolve());
  });
}

async function waitForServer(url, timeoutMs = 90000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (res.ok) return true;
    } catch {
      // ignore and retry
    }
    await sleep(1500);
  }
  return false;
}

async function checkRenderable(url) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(2500);
    const state = await page.evaluate(() => {
      const root = document.querySelector('#root');
      const rootHtml = (root?.innerHTML || '').trim();
      const bodyLen = document.body?.innerText?.length || 0;
      return {
        rootHtml,
        bodyLen,
      };
    });

    const hasTemplateMarker = state.rootHtml.includes('<!--<?- html ?>-->');
    const isRenderable = state.bodyLen > 0 && !hasTemplateMarker;
    return { isRenderable, errors, state };
  } finally {
    await browser.close();
  }
}

async function runLighthouse(url, outputPath) {
  await runCommand('npx', [
    'lighthouse',
    `"${url}"`,
    '--output=json',
    `--output-path="${outputPath}"`,
    '--chrome-flags="--headless=new --no-sandbox --disable-gpu"',
    '--max-wait-for-load=60000',
  ]);
}

function cleanDist() {
  rmSync('dist', { recursive: true, force: true });
}

function validateBuildArtifacts() {
  const htmlPath = join('dist', 'html', 'main', 'index.html');
  if (!existsSync(htmlPath)) {
    throw new Error(`build output missing: ${htmlPath}`);
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
    throw new Error(`build artifact mismatch, missing files: ${missing.join(', ')}`);
  }
}

function prepareStaticEntry() {
  const sourceHtmlPath = join('dist', 'html', 'main', 'index.html');
  const staticEntryPath = join('dist', 'index.html');
  if (!existsSync(sourceHtmlPath)) {
    throw new Error(`static source html missing: ${sourceHtmlPath}`);
  }
  // 将构建产物入口映射到 dist 根目录，保证 static 模式以 / 作为真实首页路径。
  copyFileSync(sourceHtmlPath, staticEntryPath);
}

async function main() {
  const shouldBuild = process.env.SKIP_BUILD !== 'true';
  if (shouldBuild) {
    cleanDist();
    await runCommand('npm', ['run', 'build']);
    validateBuildArtifacts();
  }

  const modesToTry = MODE === 'serve' && ALLOW_STATIC_FALLBACK ? ['serve', 'static'] : [MODE];

  for (const mode of modesToTry) {
    const port = DEFAULT_PORT;
    const appUrl = mode === 'serve'
      ? `http://localhost:${port}/`
      : `http://localhost:${port}/`;

    let proc;
    try {
      if (mode === 'serve') {
        proc = startProcess('npm', ['run', 'serve'], {
          env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
        });
      } else {
        prepareStaticEntry();
        proc = startProcess('npx', ['http-server', 'dist', '-p', String(port), '-c-1']);
      }

      const ready = await waitForServer(appUrl, 90000);
      if (!ready) {
        throw new Error(`[${mode}] server not ready: ${appUrl}`);
      }

      const renderCheck = await checkRenderable(appUrl);
      if (!renderCheck.isRenderable) {
        const reason = JSON.stringify(renderCheck, null, 2);
        throw new Error(`[${mode}] render check failed:\n${reason}`);
      }

      await runLighthouse(appUrl, OUTPUT_PATH);
      console.log(`\nLighthouse completed.`);
      console.log(`- mode: ${mode}`);
      console.log(`- url: ${appUrl}`);
      console.log(`- output: ${OUTPUT_PATH}`);
      return;
    } catch (error) {
      console.error(`\nMode ${mode} failed:`, error.message);
      if (mode === modesToTry[modesToTry.length - 1]) {
        process.exitCode = 1;
      }
    } finally {
      await stopProcess(proc);
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

