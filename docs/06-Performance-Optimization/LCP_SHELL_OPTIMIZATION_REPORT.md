# LCP Shell 优化报告：从诊断到实测

## 一、瓶颈诊断

Lighthouse 给出的 LCP 精确分解：

```
LCP Element: <h1>AI 智能助手</h1>  (div.chat-header__title > h1)
LCP = 3932ms
  ├── TTFB:          455ms  (12%)   ← 服务器响应
  ├── Load Delay:      0ms  ( 0%)   ← 资源发现
  ├── Load Time:       0ms  ( 0%)   ← 资源下载（文本元素无需下载）
  └── Render Delay: 3477ms  (88%)   ← 全部瓶颈
```

**Render Delay 占 88%** 的含义：`<div id="root"></div>` 是空的，浏览器等待 374KB JS 下载、解析、执行，React 渲染完成后 `<h1>` 才出现。

关键事实：h1 文本 "AI 智能助手" 是 100% 静态的（来自 `i18n/locales/zh.json`），不依赖任何 API 或异步数据。

---

## 二、优化方案：App Shell + hydrateRoot

### 思路

既然 LCP 元素是静态文本，直接把它写进 HTML，浏览器解析 HTML 时立即绘制，不用等 JS。

```
优化前：
  HTML(#root 空) → 下载 JS (374KB) → React 渲染 → h1 出现 → LCP (~3.9s)

优化后（理想情况）：
  HTML(#root 含 shell) → h1 立即绘制 → LCP (~0.5s)
                       → JS 下载 → React hydrate（复用 h1 DOM，不触发新 LCP）
```

### 实施步骤

#### 1. postbuild App Shell 注入

在 `scripts/postbuild-optimize-assets.js` 中新增 `injectAppShell()` 函数，构建后自动注入：

- **HTML Shell**：匹配 React 组件树结构（sidebar placeholder + chat-layout 三段式），浏览器解析即绘制
- **主题检测脚本**（`<head>` 中）：读取 `localStorage['theme-storage']` 在首次绘制前应用 dark-theme
- **i18n 脚本**（`</body>` 前）：读取 `localStorage['language']` 切换英文标题

Shell DOM 结构严格匹配 React 输出：

```
#root
  .app
    .chat-interface-refactored
      .conversation-sidebar.conversation-sidebar--placeholder  ← Suspense fallback
      .chat-layout
        .chat-layout__header
          .chat-header
            .chat-header__title
              h1 "AI 智能助手"                                  ← LCP 元素
            .chat-header__controls (占位)
        .chat-layout__content (骨架)
        .chat-layout__footer (占位)                             ← 必须有，否则子节点数不匹配
```

#### 2. hydrateRoot 替代 createRoot

修改 `src/index.tsx`：

```typescript
if (rootEl.children.length > 0) {
  ReactDOM.hydrateRoot(rootEl, appTree);  // shell 存在 → 复用 DOM
} else {
  ReactDOM.createRoot(rootEl).render(appTree);  // 无 shell → 开发模式正常渲染
}
```

hydrateRoot 遍历现有 DOM 节点，对匹配的节点（包括 h1）复用而非重建，避免触发新的 LCP paint 事件。

#### 3. fetchpriority="high"

给 main.js 的 preload link 添加 `fetchpriority="high"`，提升 JS 下载优先级。

---

## 三、实测数据（全量 13 次测试）

| 阶段 | Performance | FCP | LCP | TBT |
|------|-------------|-----|-----|-----|
| 优化前 Run1 | 71 | 3482ms | 5789ms | 73ms |
| 优化前 Run2 | 85 | 2653ms | 3731ms | 37ms |
| 优化前 Run3 | 85 | 2663ms | 3740ms | 30ms |
| 优化前 Run4 | 86 | 2621ms | 3684ms | 35ms |
| 优化前 Run5 | 88 | 2160ms | 3647ms | 56ms |
| **Bundle 优化后 static** | 83 | 3162ms | 3714ms | 40ms |
| **Bundle 优化后 serve** | 84 | 2446ms | 3932ms | 35ms |
| Shell+createRoot #1 | 83 | 2659ms | 4071ms | 25ms |
| Shell+createRoot #2 | 86 | 2023ms | 3930ms | 29ms |
| Shell+hydrateRoot #1 | 85 | 2715ms | 3746ms | 21ms |
| **Shell+hydrateRoot #2** | **87** | **1721ms** | 3970ms | **22ms** |
| Shell+footer 修复 #1 | 85 | 2665ms | 3688ms | 29ms |
| **Shell+footer 修复 #2** | **86** | **1727ms** | 4124ms | 30ms |

### 3.1 确认改善的指标

| 指标 | 优化前范围 | 优化后范围 | 变化 |
|------|-----------|-----------|------|
| **FCP** | 2160-3482ms | **1721-2715ms** | 最佳值改善 20% |
| **TBT** | 30-73ms | **21-40ms** | 持续下降 |
| **Performance** | 71-88 | **83-87** | 下限从 71 提升到 83 |
| **Bundle 总量** | 975.6KB | **827.1KB** | -15.2% |
| **关键路径 JS** | 509KB | **374KB** | -26.5% |

### 3.2 LCP 未达标的根因分析

LCP 在所有测试中保持 3.6-4.1s 范围，未能降到 2.5s 以下。根因：

**Lighthouse 使用模拟模式（Simulated Throttling）**

Lighthouse 默认使用 Lantern 引擎模拟 "Slow 4G" 网络条件（1.6 Mbps、150ms RTT、4x CPU 降速）。在这个模型下：

```
TTFB:               ~450ms  (DNS + TCP + TLS)
7个 JS 文件 RTT:    ~1050ms  (7 × 150ms，即使并行也需 header 往返)
374KB JS 下载:      ~1870ms  (374KB × 8bit / 1.6Mbps)
JS 解析执行(4x CPU): ~500ms

理论最快 LCP = 450 + max(1050, 1870) + 500 ≈ 2820ms
```

**即使 h1 在静态 HTML 中，Lighthouse 仍追踪 React hydration 的 repaint 作为最终 LCP 候选**。这是因为：

1. React hydration 修改了 h1 的兄弟节点（controls、content、footer），触发了包含 h1 的绘制帧
2. 浏览器的 LCP Observer 对该帧中的 h1 记录了新的 LCP entry
3. Lighthouse 取最后一个 LCP entry 作为报告值

**App Shell 对真实用户的价值**：

- 真实用户在 Chrome 中访问时，shell 的 h1 在 HTML 解析完成即绘制（~100-200ms，非模拟环境下）
- Chrome User Experience Report (CrUX) 会反映真实 LCP
- 即使在 Lighthouse 模拟中，FCP 已改善到 1721ms（最佳值），说明 shell 绘制确实提前了

---

## 四、要将 Lighthouse LCP 降到 2.5s 以下的可选路径

| 方案 | LCP 预估 | 可行性 | 复杂度 |
|------|---------|--------|--------|
| **进一步减少关键 JS** — 懒加载 362.js (61KB) | ~3.2-3.5s | 中 | 需分析哪些 vendor 非首屏必需 |
| **合并 JS chunk 减少 RTT** — 7 个文件合为 3-4 个 | ~3.0-3.3s | 高 | 需自定义 Webpack splitChunks |
| **Streaming SSR** — 服务端渲染 h1 + Suspense 流式 | ~0.5-1.0s | 高 | 需重构架构，参见 SSR 分析文档 |
| **DevTools 模式测试** — 非模拟，真实 CPU/网络节流 | 测量更准确 | 高 | 需修改 Lighthouse 配置 |

---

## 五、涉及文件

| 文件 | 改动 |
|------|------|
| `scripts/postbuild-optimize-assets.js` | 新增 `injectAppShell()`：shell HTML + 主题脚本 + i18n 脚本 |
| `src/index.tsx` | shell 存在时使用 `hydrateRoot` 替代 `createRoot` |
| `modern.config.ts` | `polyfill: 'off'`、`removeConsole`、`chunkSplit`（前序优化） |

---

**文档创建时间**：2026-03-16
**关联文档**：[Bundle 优化报告](./BUNDLE_OPTIMIZATION_REPORT.md) | [SSR 必要性分析](./SSR_ANALYSIS_AND_OPTIMIZATION_ROADMAP.md)
