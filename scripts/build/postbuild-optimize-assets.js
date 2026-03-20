#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync, constants as zlibConstants } from 'node:zlib';

const INLINE_MAIN_CSS = (process.env.INLINE_MAIN_CSS || 'true') !== 'false';
const PRECOMPRESS_ASSETS = (process.env.PRECOMPRESS_ASSETS || 'true') !== 'false';
const CLEAN_TEMPLATE_MARKERS = (process.env.CLEAN_TEMPLATE_MARKERS || 'true') !== 'false';
const INJECT_PRELOAD_HINTS = (process.env.INJECT_PRELOAD_HINTS || 'true') !== 'false';
const INJECT_APP_SHELL = (process.env.INJECT_APP_SHELL || 'true') !== 'false';

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

function cleanServerTemplateMarkers(htmlPath) {
  if (!existsSync(htmlPath)) return false;
  const html = readFileSync(htmlPath, 'utf8');

  const markers = [
    /<!--<\?-\s*html\s*\?>-->/g,
    /<!--<\?-\s*chunksMap\.js\s*\?>-->/g,
    /<!--<\?-\s*SSRDataScript\s*\?>-->/g,
  ];

  let cleaned = html;
  let count = 0;
  for (const marker of markers) {
    const before = cleaned;
    cleaned = cleaned.replace(marker, '');
    if (cleaned !== before) count += 1;
  }

  if (count > 0) {
    writeFileSync(htmlPath, cleaned);
  }
  return count;
}

function injectAppShell(htmlPath) {
  if (!existsSync(htmlPath)) return false;
  let html = readFileSync(htmlPath, 'utf8');

  if (!html.includes('<div id="root"></div>')) return false;

  // 在 <head> 中注入主题检测脚本，在浏览器首次绘制前应用 dark-theme
  const themeScript = [
    '<script>',
    '(function(){try{',
    "var s=localStorage.getItem('theme-storage');",
    'if(s){var d=JSON.parse(s);var t=d&&d.state&&d.state.theme;',
    "if(t==='dark'||(t==='auto'&&matchMedia('(prefers-color-scheme:dark)').matches)){",
    "document.documentElement.setAttribute('data-theme','dark');",
    "document.documentElement.classList.add('dark-theme')}}",
    '}catch(e){}})()',
    '</script>',
  ].join('');

  // App Shell HTML — 结构必须和 React 组件树完全匹配，hydrateRoot 才能复用 DOM 节点
  // 渲染链: App(.app) > ChatInterfaceRefactored(.chat-interface-refactored)
  //   > Suspense fallback(.conversation-sidebar--placeholder) + ChatLayout(.chat-layout)
  const shellHtml = [
    '<div id="root">',
    '<div class="app">',
    '<div class="chat-interface-refactored">',
    '<div class="conversation-sidebar conversation-sidebar--placeholder expanded" aria-hidden="true"></div>',
    '<div class="chat-layout">',
    '<div class="chat-layout__header">',
    '<div class="chat-header">',
    '<div class="chat-header__title">',
    '<h1>AI 智能助手</h1>',
    '</div>',
    '<div class="chat-header__controls">',
    '<div style="display:flex;gap:12px;min-height:40px"></div>',
    '</div>',
    '</div>',
    '</div>',
    '<div class="chat-layout__content">',
    '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:16px">',
    '加载中...',
    '</div>',
    '</div>',
    '<div class="chat-layout__footer"></div>',
    '</div>',
    '</div>',
    '</div>',
    '</div>',
  ].join('');

  // i18n 脚本 — 放在 shell 后、</body> 前，同步执行在首次绘制前切换英文标题
  const i18nScript =
    "<script>try{if(localStorage.getItem('language')==='en'){" +
    "var h=document.querySelector('#root h1');" +
    "if(h)h.textContent='AI Assistant'}}catch(e){}</script>";

  html = html.replace('</head>', themeScript + '</head>');
  html = html.replace('<div id="root"></div>', shellHtml);
  html = html.replace('</body>', i18nScript + '</body>');

  writeFileSync(htmlPath, html);
  return true;
}

function injectPreloadHints(htmlPath) {
  if (!existsSync(htmlPath)) return 0;
  const html = readFileSync(htmlPath, 'utf8');

  const scriptMatches = [...html.matchAll(/<script[^>]*src="(\/static\/js\/main\.[^"]+\.js)"[^>]*>/g)];
  if (scriptMatches.length === 0) return 0;

  const preloadTags = scriptMatches
    .map((m) => `<link rel="preload" href="${m[1]}" as="script" crossorigin fetchpriority="high">`)
    .join('');

  const injected = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">${preloadTags}`);
  if (injected === html) return 0;

  writeFileSync(htmlPath, injected);
  return scriptMatches.length;
}

function main() {
  if (!existsSync('dist')) {
    throw new Error('dist not found. run build first.');
  }

  const htmlEntries = [
    join('dist', 'html', 'main', 'index.html'),
    join('dist', 'index.html'),
  ];

  if (CLEAN_TEMPLATE_MARKERS) {
    let total = 0;
    htmlEntries.forEach((htmlPath) => {
      total += cleanServerTemplateMarkers(htmlPath);
    });
    console.log(`[postbuild] clean template markers done: ${total} markers removed`);
  } else {
    console.log('[postbuild] skip clean template markers');
  }

  if (INJECT_APP_SHELL) {
    let injected = 0;
    htmlEntries.forEach((htmlPath) => {
      if (injectAppShell(htmlPath)) injected += 1;
    });
    console.log(`[postbuild] app shell injected: ${injected} html files`);
  } else {
    console.log('[postbuild] skip app shell');
  }

  if (INJECT_PRELOAD_HINTS) {
    let total = 0;
    htmlEntries.forEach((htmlPath) => {
      total += injectPreloadHints(htmlPath);
    });
    console.log(`[postbuild] preload hints injected: ${total} links`);
  } else {
    console.log('[postbuild] skip preload hints');
  }

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

