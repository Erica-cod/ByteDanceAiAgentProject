# P1 实施结果（Markdown 动态加载 + 组件差分）

## 本轮目标

按照“业务组件 / 基础组件”拆分原则，先处理高变化、高成本的 Markdown 渲染链路：

- 对外保持最小可用接口
- 对内按变化点拆分，避免为拆而拆

## 已完成改造

### 1) 组件差分：业务层与基础层拆分

- 新增基础组件：`src/components/base/Markdown/BaseMarkdownRenderer.tsx`
  - 职责：仅负责 Markdown 引擎加载与渲染（无业务规则）
  - 对外接口：`content`、`components`、`enableHighlight` 等最小参数
- 业务层继续保留在：
  - `src/components/business/Message/StreamingMarkdown.tsx`
  - `src/components/old-structure/StreamingMarkdown.tsx`
  - 职责：JSON 过滤、计划卡片识别、容错策略、业务态展示

### 2) 按变化速率拆分：重依赖按需加载

- 在基础组件中改为动态导入：
  - `react-markdown`
  - `remark-gfm`
  - `rehype-highlight`（仅检测到代码块时加载）
- 结果：把“变化慢但成本高”的 Markdown 引擎能力收敛到基础层，并按需触发。

## P1 分析结果（Top20）

报告文件：

- `docs/06-Performance-Optimization/Bundle-Analyzer-P0/TOP20_MODULES_REPORT.md`
- `docs/06-Performance-Optimization/Bundle-Analyzer-P0/top20-modules.json`

关键信息（当前口径）：

- 首屏 Top5 仍以 `core-js`、`router`、`react-dom` 为主
- 非首屏 Top5 仍由 `highlight.js`、`micromark*`、`react-virtuoso` 主导
- Markdown 重链路稳定处于非首屏组，满足“高成本能力按需加载”的拆分目标

## P1.2 补充（重 UI 组件异步化）

本轮继续完成“重 UI 组件拆分”：

- `src/components/business/Message/MessageItemRenderer.tsx`
  - `MultiAgentDisplay` 改为 `React.lazy + Suspense`
  - `ProgressiveMessageRefactored` 改为 `React.lazy + Suspense`
- `src/components/business/Chat/ChatInterfaceRefactored.tsx`
  - `SettingsPanel` 改为按打开时加载（`isSettingsOpen` 条件渲染 + `React.lazy`）

构建结果显示新增多个细粒度 async chunk，说明重 UI 代码已被拆到异步路径。

### 数据解读

- Top20 的“模块大小”不会因懒加载而直接变小（它统计的是模块本身大小）
- 这轮优化的价值主要体现在“加载时机后移”，而不是“模块体积缩小”
- 下一轮如果要看到 Top20 数字明显下降，需要继续做：
  - 依赖替换（更轻量库）
  - 语法/功能收敛（减少引入范围）

## 结论

- 这轮 P1 已完成“按变化点拆分”的架构动作，且未破坏业务侧最小接口
- 下一步应继续推进：
  - 对首屏 `core-js` / i18n 路径做更细粒度收敛
  - 对非首屏 Markdown 链路继续做触发时机优化（如可见区触发）
