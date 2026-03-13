# Bundle Analyzer P0 报告（Top 20 模块）

## 说明

- 数据来源：`dist/static/js/**/*.js.map`
- 统计方法：按 source map 的 `sourcesContent` 字节去重后，聚合到包级别（用于定位热点模块）
- 分组定义：
  - 首屏：非 `async/` 的 JS chunk
  - 非首屏：`async/` 下的 JS chunk

## 汇总

- 生成时间：2026-03-13T04:12:21.895Z
- 分析 map 数量：30
- 首屏模块总字节：1.11 MB
- 非首屏模块总字节：1.54 MB
- 首屏 Top20 覆盖：1.08 MB
- 非首屏 Top20 覆盖：1.04 MB

## 首屏 Top 20 模块

| 排名 | 模块 | 大小 |
|---|---|---|
| 1 | `node_modules/core-js` | 422.3 KB |
| 2 | `other/../../../../router.ts` | 178.5 KB |
| 3 | `node_modules/react-dom` | 130.5 KB |
| 4 | `node_modules/i18next` | 78.4 KB |
| 5 | `other/../../../../index.tsx` | 58.8 KB |
| 6 | `other/../../../../utils.ts` | 47.5 KB |
| 7 | `other/../../../../lib/hooks.tsx` | 35.6 KB |
| 8 | `node_modules/react-i18next` | 21.9 KB |
| 9 | `other/../../../../history.ts` | 21.1 KB |
| 10 | `other/../../../../lib/components.tsx` | 20.7 KB |
| 11 | `other/webpack/runtime/jsonp chunk loading` | 17.6 KB |
| 12 | `node_modules/zustand` | 17.1 KB |
| 13 | `other/../../../src/utils/storage/localStorageLRU.ts` | 10.4 KB |
| 14 | `other/../../../../dom.ts` | 9.7 KB |
| 15 | `other/webpack/runtime/hot module replacement` | 9.3 KB |
| 16 | `node_modules/react` | 8.0 KB |
| 17 | `node_modules/@rsbuild/core` | 6.1 KB |
| 18 | `other/../../../src/utils/events/eventManager.ts` | 5.3 KB |
| 19 | `other/../../../../lib/context.ts` | 5.1 KB |
| 20 | `node_modules/scheduler` | 4.3 KB |

## 非首屏 Top 20 模块

| 排名 | 模块 | 大小 |
|---|---|---|
| 1 | `node_modules/highlight.js` | 376.6 KB |
| 2 | `node_modules/micromark-core-commonmark` | 111.0 KB |
| 3 | `node_modules/react-virtuoso` | 92.3 KB |
| 4 | `node_modules/mdast-util-to-hast` | 51.4 KB |
| 5 | `node_modules/immer` | 48.4 KB |
| 6 | `node_modules/unified` | 40.7 KB |
| 7 | `node_modules/micromark` | 40.6 KB |
| 8 | `node_modules/mdast-util-to-markdown` | 38.7 KB |
| 9 | `node_modules/property-information` | 34.7 KB |
| 10 | `node_modules/vfile` | 30.8 KB |
| 11 | `node_modules/mdast-util-from-markdown` | 28.3 KB |
| 12 | `node_modules/micromark-extension-gfm-table` | 26.9 KB |
| 13 | `other/../../../../src/hooks/data/useSSEStream/index.ts` | 25.7 KB |
| 14 | `node_modules/micromark-extension-gfm-autolink-literal` | 19.8 KB |
| 15 | `node_modules/hast-util-to-jsx-runtime` | 19.3 KB |
| 16 | `node_modules/hast-util-to-text` | 19.1 KB |
| 17 | `other/../../../../src/components/old-structure/MultiAgentDisplay.tsx` | 16.8 KB |
| 18 | `node_modules/lowlight` | 14.6 KB |
| 19 | `other/webpack/runtime/importScripts chunk loading` | 14.6 KB |
| 20 | `node_modules/micromark-util-subtokenize` | 14.1 KB |

## P0 建议（基于本次 Top20）

- 优先处理首屏 Top20 中体积最大的 `node_modules/*` 依赖，确认是否可延迟加载。
- 对非首屏 Top20 中的重模块，评估是否按路由/操作再进一步拆分。
- 首屏如存在 markdown 高亮、图表、重编辑器等库，建议改为动态导入。
- 每次改动后复跑本脚本与 Lighthouse，观察 Top20 和 TBT/LCP 的联动变化。

