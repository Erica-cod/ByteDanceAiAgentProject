# browserslist 调整后 Lighthouse 分析

## 目标

通过收窄生产浏览器目标，减少不必要的 legacy polyfill 与转译开销，观察首屏性能变化。

## 相关改动

- 文件：`package.json`
- 新增：`browserslist.production` 与 `browserslist.development` 分离配置

## 报告文件

- 改前（基线）：`test/bench-results/lighthouse-prod-after-worker.json`
- 改后（同口径）：`test/bench-results/lighthouse-prod-after-browserslist-8082.json`

> 说明：两份报告均基于 `http://localhost:8082/`，属于同入口对比。

## 关键指标对比（同口径）

- Performance：`71 -> 75`（+4）
- FCP：`2108ms -> 1731ms`（-377ms）
- LCP：`7583ms -> 6561ms`（-1023ms）
- TBT：`209.5ms -> 135.5ms`（-74ms）
- TTI：`7583ms -> 6643ms`（-940ms）
- Legacy JavaScript 节省估算：`600ms -> 0ms`

## 结论

- `browserslist` 收敛已生效，尤其是 legacy JS 负担显著下降
- 但总体提升仍有限，说明核心瓶颈仍有一部分来自：
  - 首屏未必要加载的 JS
  - 异步 chunk 的初始阶段执行压力
  - 非关键逻辑占用主线程

## 注意事项

- 历史上曾出现过“不同入口口径”导致分数差异过大的情况
- 后续所有对比建议固定以下条件：
  - 同 URL
  - 同运行模式（生产）
  - 同机器与浏览器环境
  - 同测试参数（Lighthouse flags）
