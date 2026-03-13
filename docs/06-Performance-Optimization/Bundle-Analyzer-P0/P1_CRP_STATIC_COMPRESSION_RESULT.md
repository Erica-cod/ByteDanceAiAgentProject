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

