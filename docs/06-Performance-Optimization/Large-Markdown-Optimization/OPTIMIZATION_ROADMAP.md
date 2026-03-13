# 大 Markdown 性能优化路线图（后续）

## 现状摘要

当前已经完成两项关键动作：

- 文本统计迁移 Web Worker（输入链路长任务下降）
- 调整 `browserslist`（legacy JS 压力下降）

下一阶段重点从“可用”走向“稳定高性能”。

## 成熟方案映射（业界常见）

### 1) 差异化现代发布

- 思路：给现代浏览器输出更轻量代码，减少转译与 polyfill
- 价值：持续降低 `lib-polyfill` 和 parse/compile 成本

### 2) 路由级 / 功能级拆包

- 思路：首屏只加载当前必需代码，重模块按需加载
- 价值：降低 unused JS、缩短 LCP 路径

### 3) 非关键脚本下沉

- 思路：第三方或非首屏脚本延后加载，必要时 worker 化
- 价值：降低主线程竞争，改善 TBT/INP

### 4) 性能预算门禁

- 思路：把 Lighthouse 与包体阈值接入 CI
- 价值：避免后续迭代性能回退

## 建议执行顺序

### P0（先做，1-2 天）

- 引入 bundle 分析（定位 `lib-polyfill` 与大 chunk 来源）
- 产出“首屏必需 / 可延迟”模块清单
- 本轮产出目录：`docs/06-Performance-Optimization/Bundle-Analyzer-P0/`

### P1（高收益，2-4 天）

- 对非首屏重模块做动态导入
- 收紧首屏路径中的大依赖

### P2（治理，持续）

- 接入性能预算（Lighthouse 分数、TBT、unused JS）
- 接入真实用户指标（web-vitals）做回归监控

## 阶段验收建议

- Lighthouse（生产同口径）
  - Performance >= 80
  - TBT <= 100ms
  - LCP <= 5000ms
- 输入链路（Playwright）
  - `maxLongTask p95` 继续下降
  - 大文本粘贴时主观“明显卡顿”基本消失
