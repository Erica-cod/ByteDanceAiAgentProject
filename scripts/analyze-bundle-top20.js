#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const distJsDir = path.join(projectRoot, 'dist', 'static', 'js');
const outputDir = path.join(
  projectRoot,
  'docs',
  '06-Performance-Optimization',
  'Bundle-Analyzer-P0'
);

function normalizeSourcePath(rawSource) {
  let source = (rawSource || '').replaceAll('\\', '/');
  source = source.replace(/^webpack:\/\/[^/]+\//, '');
  source = source.replace(/^\.\//, '');
  source = source.replace(/^\.\/+/, '');
  return source || '(unknown)';
}

function groupSource(sourcePath) {
  let source = sourcePath.replaceAll('\\', '/');
  const nodeModulesIndex = source.lastIndexOf('/node_modules/');
  if (nodeModulesIndex >= 0) {
    const modulePath = source.slice(nodeModulesIndex + '/node_modules/'.length);
    const parts = modulePath.split('/').filter(Boolean);
    if (!parts.length) return 'node_modules/(unknown)';
    if (parts[0].startsWith('@') && parts.length > 1) {
      return `node_modules/${parts[0]}/${parts[1]}`;
    }
    return `node_modules/${parts[0]}`;
  }

  source = source.replace(/^src\//, 'src/');
  if (!source.startsWith('src/')) {
    return `other/${source || '(unknown)'}`;
  }
  return source;
}

function aggregateByGroup(sourceFileMap) {
  const groupMap = new Map();
  for (const [sourcePath, bytes] of sourceFileMap.entries()) {
    const groupKey = groupSource(sourcePath);
    groupMap.set(groupKey, (groupMap.get(groupKey) || 0) + bytes);
  }
  return groupMap;
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function topNFromMap(sizeMap, n = 20) {
  return [...sizeMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([source, bytes], idx) => ({
      rank: idx + 1,
      source,
      bytes,
      size: formatBytes(bytes),
    }));
}

function sumBytes(items) {
  return items.reduce((sum, item) => sum + item.bytes, 0);
}

function buildMarkdownReport(result) {
  const lines = [];
  lines.push('# Bundle Analyzer P0 报告（Top 20 模块）');
  lines.push('');
  lines.push('## 说明');
  lines.push('');
  lines.push('- 数据来源：`dist/static/js/**/*.js.map`');
  lines.push('- 统计方法：按 source map 的 `sourcesContent` 字节去重后，聚合到包级别（用于定位热点模块）');
  lines.push('- 分组定义：');
  lines.push('  - 首屏：非 `async/` 的 JS chunk');
  lines.push('  - 非首屏：`async/` 下的 JS chunk');
  lines.push('');
  lines.push('## 汇总');
  lines.push('');
  lines.push(`- 生成时间：${result.generatedAt}`);
  lines.push(`- 分析 map 数量：${result.meta.analyzedMapCount}`);
  lines.push(`- 首屏模块总字节：${formatBytes(result.meta.initialTotalBytes)}`);
  lines.push(`- 非首屏模块总字节：${formatBytes(result.meta.asyncTotalBytes)}`);
  lines.push(`- 首屏 Top20 覆盖：${formatBytes(sumBytes(result.initialTop20))}`);
  lines.push(`- 非首屏 Top20 覆盖：${formatBytes(sumBytes(result.asyncTop20))}`);
  lines.push('');
  lines.push('## 首屏 Top 20 模块');
  lines.push('');
  lines.push('| 排名 | 模块 | 大小 |');
  lines.push('|---|---|---|');
  for (const item of result.initialTop20) {
    lines.push(`| ${item.rank} | \`${item.source}\` | ${item.size} |`);
  }
  lines.push('');
  lines.push('## 非首屏 Top 20 模块');
  lines.push('');
  lines.push('| 排名 | 模块 | 大小 |');
  lines.push('|---|---|---|');
  for (const item of result.asyncTop20) {
    lines.push(`| ${item.rank} | \`${item.source}\` | ${item.size} |`);
  }
  lines.push('');
  lines.push('## P0 建议（基于本次 Top20）');
  lines.push('');
  lines.push('- 优先处理首屏 Top20 中体积最大的 `node_modules/*` 依赖，确认是否可延迟加载。');
  lines.push('- 对非首屏 Top20 中的重模块，评估是否按路由/操作再进一步拆分。');
  lines.push('- 首屏如存在 markdown 高亮、图表、重编辑器等库，建议改为动态导入。');
  lines.push('- 每次改动后复跑本脚本与 Lighthouse，观察 Top20 和 TBT/LCP 的联动变化。');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const allFiles = await walkFiles(distJsDir);
  const mapFiles = allFiles.filter(file => file.endsWith('.js.map'));

  const initialSourceFilesMap = new Map();
  const asyncSourceFilesMap = new Map();

  for (const mapFile of mapFiles) {
    const raw = await fs.readFile(mapFile, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const sources = Array.isArray(parsed.sources) ? parsed.sources : [];
    const sourcesContent = Array.isArray(parsed.sourcesContent) ? parsed.sourcesContent : [];
    const isAsyncChunk = mapFile.includes(`${path.sep}async${path.sep}`);
    const targetMap = isAsyncChunk ? asyncSourceFilesMap : initialSourceFilesMap;

    for (let i = 0; i < sources.length; i += 1) {
      const source = normalizeSourcePath(sources[i]);
      const content = sourcesContent[i];
      if (typeof content !== 'string') continue;

      const bytes = Buffer.byteLength(content, 'utf8');
      if (bytes <= 0) continue;

      // 说明：
      // 同一个 source 可能出现在多个 chunk 的 map 中。
      // 为避免重复累计导致体积虚高，这里按“单 source 最大值”去重统计。
      const prev = targetMap.get(source) || 0;
      if (bytes > prev) {
        targetMap.set(source, bytes);
      }
    }
  }

  const initialMap = aggregateByGroup(initialSourceFilesMap);
  const asyncMap = aggregateByGroup(asyncSourceFilesMap);
  const initialTotalBytes = [...initialMap.values()].reduce((sum, item) => sum + item, 0);
  const asyncTotalBytes = [...asyncMap.values()].reduce((sum, item) => sum + item, 0);

  const result = {
    generatedAt: new Date().toISOString(),
    meta: {
      analyzedMapCount: mapFiles.length,
      initialModuleCount: initialMap.size,
      asyncModuleCount: asyncMap.size,
      initialSourceFileCount: initialSourceFilesMap.size,
      asyncSourceFileCount: asyncSourceFilesMap.size,
      initialTotalBytes,
      asyncTotalBytes,
    },
    initialTop20: topNFromMap(initialMap, 20),
    asyncTop20: topNFromMap(asyncMap, 20),
  };

  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'top20-modules.json');
  const mdPath = path.join(outputDir, 'TOP20_MODULES_REPORT.md');
  await fs.writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await fs.writeFile(mdPath, `${buildMarkdownReport(result)}\n`, 'utf8');

  const topInitial = result.initialTop20.slice(0, 5).map(item => `${item.source} (${item.size})`);
  const topAsync = result.asyncTop20.slice(0, 5).map(item => `${item.source} (${item.size})`);

  console.log('Bundle Top20 分析完成');
  console.log(`- 输出 JSON: ${path.relative(projectRoot, jsonPath)}`);
  console.log(`- 输出报告: ${path.relative(projectRoot, mdPath)}`);
  console.log(`- 首屏 Top5: ${topInitial.join(', ')}`);
  console.log(`- 非首屏 Top5: ${topAsync.join(', ')}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
