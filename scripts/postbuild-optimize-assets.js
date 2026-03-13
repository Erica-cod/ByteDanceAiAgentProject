#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync, constants as zlibConstants } from 'node:zlib';

const INLINE_MAIN_CSS = (process.env.INLINE_MAIN_CSS || 'true') !== 'false';
const PRECOMPRESS_ASSETS = (process.env.PRECOMPRESS_ASSETS || 'true') !== 'false';

function inlineMainCss(htmlPath) {
  if (!existsSync(htmlPath)) return false;
  const html = readFileSync(htmlPath, 'utf8');
  const mainCssMatch = html.match(/<link[^>]*href="(\/static\/css\/main\.[^"]+\.css)"[^>]*>/i);
  if (!mainCssMatch) return false;

  const href = mainCssMatch[1];
  const cssPath = join('dist', href.replace(/^\//, '').replace(/\//g, '\\'));
  if (!existsSync(cssPath)) {
    throw new Error(`main css missing for inline: ${cssPath}`);
  }

  let css = readFileSync(cssPath, 'utf8');
  css = css.replace(/<\/style/gi, '<\\/style');

  const styleTag = `<style id="inline-main-css">${css}</style>`;
  const nextHtml = html.replace(mainCssMatch[0], styleTag);
  writeFileSync(htmlPath, nextHtml);
  return true;
}

function collectCompressTargets(dir, result = []) {
  if (!existsSync(dir)) return result;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collectCompressTargets(fullPath, result);
      continue;
    }
    if (!stat.isFile()) continue;
    if (fullPath.endsWith('.gz') || fullPath.endsWith('.br')) continue;
    if (!/\.(js|css|html|svg|json|txt|map)$/.test(fullPath)) continue;
    result.push(fullPath);
  }
  return result;
}

function createPrecompressedAssets() {
  const targets = collectCompressTargets('dist');
  const dedup = Array.from(new Set(targets));
  let compressedCount = 0;

  for (const filePath of dedup) {
    const raw = readFileSync(filePath);
    if (raw.length < 1024) continue;

    const gz = gzipSync(raw, { level: 9 });
    const br = brotliCompressSync(raw, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
        [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
      },
    });

    writeFileSync(`${filePath}.gz`, gz);
    writeFileSync(`${filePath}.br`, br);
    compressedCount += 1;
  }

  return compressedCount;
}

function main() {
  if (!existsSync('dist')) {
    throw new Error('dist not found. run build first.');
  }

  const htmlEntries = [
    join('dist', 'html', 'main', 'index.html'),
    join('dist', 'index.html'),
  ];

  if (INLINE_MAIN_CSS) {
    let inlined = 0;
    htmlEntries.forEach((htmlPath) => {
      if (inlineMainCss(htmlPath)) inlined += 1;
    });
    console.log(`[postbuild] inline main css done: ${inlined} html files`);
  } else {
    console.log('[postbuild] skip inline main css');
  }

  if (PRECOMPRESS_ASSETS) {
    const count = createPrecompressedAssets();
    console.log(`[postbuild] precompress done: ${count} assets`);
  } else {
    console.log('[postbuild] skip precompress assets');
  }
}

main();

