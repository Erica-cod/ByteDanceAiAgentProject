# Modern.js BFF 项目 Lighthouse 全流程测试修复

## 背景

项目使用 Modern.js + BFF（`@modern-js/plugin-bff`）架构。在运行 Lighthouse 性能测试时，发现只能以静态页面形式（`http-server dist`）进行测试，无法使用 `modern serve` 进行包含 BFF API 交互的全流程测试。

---

## 根因分析

### 1. 构建产物缺少服务端 Bundle

`modern build` 生成的 `dist/` 目录结构如下：

```
dist/
├── html/main/index.html   ← 客户端 HTML（含未处理模板标记）
├── static/js/              ← 前端 JS 打包文件
├── static/css/             ← 前端 CSS 打包文件
├── api/lambda/             ← BFF lambda 编译产物（TS → JS）
├── route.json              ← 路由配置
└── modern.config.json      ← 框架配置
```

**缺少 `dist/bundles/` 目录**。由于项目是纯 SPA（`route.json` 中 `isSSR: false`），Modern.js 不会生成服务端渲染 Bundle。这导致 `modern serve` 无法执行 HTML 模板处理。

### 2. HTML 模板标记未被替换

`dist/html/main/index.html` 中残留了三个 Modern.js 服务端模板占位符：

```html
<body>
  <div id="root"><!--<?- html ?>--></div>
  <!--<?- chunksMap.js ?>-->
  <!--<?- SSRDataScript ?>-->
</body>
```

| 占位符 | 用途 | 本项目是否需要 |
|--------|------|---------------|
| `<!--<?- html ?>-->` | SSR 渲染输出 | 不需要（纯 SPA） |
| `<!--<?- chunksMap.js ?>-->` | SSR chunk 映射注入 | 不需要（`builder-runtime.js` 已包含） |
| `<!--<?- SSRDataScript ?>-->` | SSR 数据脚本 | 不需要（纯 SPA） |

由于缺少 `dist/bundles/`，`modern serve` 直接返回原始 HTML，不替换这些标记。

### 3. 测试脚本检测逻辑导致失败

`scripts/run-lighthouse-prod-fixed.js` 中的 `checkRenderable()` 函数硬编码检查了 `<!--<?- html ?>-->` 标记：

```js
const hasTemplateMarker = state.rootHtml.includes('<!--<?- html ?>-->');
const isRenderable = state.bodyLen > 0 && !hasTemplateMarker;
```

当通过 `modern serve` 访问页面时，即使 React SPA 实际上能正常渲染，该检查也会因检测到模板标记而判定页面不可渲染。

### 4. 两种模式各有缺陷（修复前）

| 模式 | 前端渲染 | BFF API | Lighthouse 测试 |
|------|---------|---------|----------------|
| `static`（http-server） | 正常（SPA） | 全部 404 | 只能测前端性能 |
| `serve`（modern serve） | 模板标记残留 | 正常 | `checkRenderable` 失败 |

---

## 解决方案

### 核心修复：构建后清理 HTML 模板标记

在 `scripts/postbuild-optimize-assets.js` 中新增 `cleanServerTemplateMarkers()` 步骤，在 `modern build` 完成后自动清理 HTML 中的服务端模板占位符。

**执行顺序**：`modern build` → 清理模板标记 → 内联 CSS → 预压缩资源

清理后的 HTML：

```html
<body>
  <div id="root"></div>
</body>
```

这样做是安全的，因为：

1. 项目不使用 SSR，这些占位符完全冗余
2. 前端 chunk 加载由 `builder-runtime.*.js` 全权负责，不依赖 `chunksMap.js` 注入
3. `modern serve` 在缺少 `dist/bundles/` 时本就不会处理这些标记

### 辅助修复

1. **`checkRenderable()` 改进** — 去掉对模板标记的硬编码检测，改为更通用的可见元素检测
2. **serve 模式超时调整** — `modern serve` 需要初始化 BFF（连接 Redis/MongoDB），超时从 90s 增至 120s
3. **新增 npm script** — `bench:lighthouse:flow:multi-agent:serve` 和 `:headed` 变体

---

## 修复后效果

| 模式 | 前端渲染 | BFF API | Lighthouse 测试 |
|------|---------|---------|----------------|
| `static`（http-server） | 正常 | 全部 404 | 纯前端性能测试 |
| `serve`（modern serve） | 正常 | 正常 | **全流程测试（含 BFF）** |

---

## 使用方式

```bash
# 静态模式（仅测前端，无 BFF）
npm run bench:lighthouse:flow:multi-agent:prod

# serve 模式（全流程，含 BFF API 交互）
npm run bench:lighthouse:flow:multi-agent:serve

# 带可视化窗口排障
npm run bench:lighthouse:flow:multi-agent:serve:headed
```

---

## 涉及文件

| 文件 | 改动 |
|------|------|
| `scripts/postbuild-optimize-assets.js` | 新增 `cleanServerTemplateMarkers()` |
| `scripts/run-lighthouse-prod-fixed.js` | `checkRenderable()` 改为可见元素检测 |
| `scripts/run-lighthouse-user-flow-multi-agent.js` | serve 模式超时和日志增强 |
| `package.json` | 新增 serve 模式 npm script |

---

## 相关文档

- [Lighthouse Flow 生产压测稳定化](./README.md)
- [Modern.js 路由解析问题分析](../../01-Architecture-Refactoring/MODERNJS_ROUTING_BUG_ANALYSIS.md)
- [Lighthouse Browserslist 分析](../Large-Markdown-Optimization/LIGHTHOUSE_BROWSERSLIST_ANALYSIS.md)

---

**文档创建时间**：2026-03-16
**修复分支**：`feat/lcp-phase1-3`
**问题状态**：已修复并验证
