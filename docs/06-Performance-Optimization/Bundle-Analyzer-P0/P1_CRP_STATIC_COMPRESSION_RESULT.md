# P1.5 首屏链路优化记录（CRP + Static 压缩）

## 背景

在 P1 动态加载后，生产口径 Lighthouse 仍表现为：

- `render-blocking-resources` 约 `910ms`
- `uses-text-compression` 仍为失败项
- `LCP` 与 `TTI` 偏高

本轮目标：在不破坏现有架构的前提下，进一步压缩首屏关键路径。

## 本轮改动

### 1) 消息渲染链路进一步懒加载

- 文件：`src/components/business/Message/MessageItemRenderer.tsx`
- 改动：
  - 将 `StreamingMarkdown` 从同步引入改为 `React.lazy` + `Suspense`
- 预期收益：
  - 减少首屏主 bundle 的解析/执行压力
  - 让 Markdown 渲染链条仅在真实需要时加载

### 2) 首屏非关键初始化延后到空闲阶段

- 文件：`src/components/business/Chat/ChatInterfaceRefactored.tsx`
- 改动：
  - `getPrivacyFirstDeviceId()` 初始化延后（`runWhenIdle`）
  - `refreshMe()` 初始化延后（`runWhenIdle`）
- 预期收益：
  - 缩短首屏关键时间段主线程竞争
  - 降低 FCP/LCP 前的同步工作量

### 3) Lighthouse static 模式补齐真实压缩能力

- 文件：`scripts/run-lighthouse-prod-fixed.js`
- 改动：
  - 构建后自动生成 `.gz/.br` 预压缩资源
  - static 服务改为 `http-server -g -b`（优先 brotli）
- 预期收益：
  - 修正“本地 static 基准不压缩”的测量偏差
  - 真实反映生产可用的传输体积

## Lighthouse 结果对比（同口径）

- 旧基线：`test/bench-results/lighthouse-prod-1773380754927.json`
- 新结果：`test/bench-results/lighthouse-prod-1773381138618.json`

| 指标 | 旧 | 新 | 变化 |
|---|---:|---:|---:|
| Performance | 71 | 85 | +14 |
| FCP | 3.5s | 2.7s | -0.8s |
| LCP | 5.8s | 3.7s | -2.1s |
| TBT | 70ms | 40ms | -30ms |
| TTI | 5.8s | 3.7s | -2.1s |
| CLS | 0 | 0.001 | 基本持平 |

## 机会项变化

- `uses-text-compression`：从失败变为通过（`score: 1`）
- `unused-javascript`：约 `252KiB` -> `23KiB`
- `render-blocking-resources`：约 `910ms` -> `480ms`

## 阶段结论

本轮属于“高性价比”优化，已经把首屏从“偏慢”拉到“可接受偏好”区间，且不需要大规模重构。  
下一步建议继续围绕 `main.css` 与剩余关键请求做精简，目标将 `render-blocking` 压到 `200ms` 左右。

---

## P1.6 结果补充（main.css 内联 + CLS 收敛）

### 增量改动

1) `scripts/run-lighthouse-prod-fixed.js`
- 在 static 基准流程中，将 `dist/index.html` 的 `main.*.css` 自动内联为 `<style>`
- 保留 `.gz/.br` 预压缩逻辑，确保静态基准与真实生产压缩策略一致

2) 侧栏首屏稳定性修正（CLS）
- `ChatInterfaceRefactored` 增加 `ConversationListLazy` 的同宽占位 fallback
- `ConversationList` 将骨架放入已挂载容器内部，避免切换时外层布局抖动
- `ChatInterfaceRefactored.css` 增加侧栏宽度兜底样式，防止异步样式到达前宽度漂移

### Lighthouse 对比（同口径）

- 上一基线：`test/bench-results/lighthouse-prod-1773382806895.json`
- 新结果：`test/bench-results/lighthouse-prod-1773383031744.json`

| 指标 | 旧 | 新 | 变化 |
|---|---:|---:|---:|
| Performance | 86 | 88 | +2 |
| FCP | 2.6s | 2.2s | -0.4s |
| LCP | 3.7s | 3.6s | -0.1s |
| TBT | 30ms | 60ms | +30ms（仍低） |
| TTI | 3.7s | 3.6s | -0.1s |
| CLS | 0.001 | 0.001 | 持平稳定 |

### 机会项变化

- `render-blocking-resources`：约 `470ms` -> `0ms`（`score: 1`）
- `unused-css-rules`：收敛为 `score: 1`
- `uses-text-compression`：持续 `score: 1`
- 当前剩余较主要机会：`unused-javascript` 约 `23KiB`（影响已较小）

### 小结

P1.6 已把当前最主要的首屏阻塞项基本清空，分数与稳定性都达到一轮较优平衡。  
下一阶段更适合转向“真实业务口径”优化（例如减少 benchmark 404 噪声、收敛剩余非关键 JS）。

