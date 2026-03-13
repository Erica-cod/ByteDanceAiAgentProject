# P0 分析结论与下一步

## 本次 P0 结论

基于 `top20-modules.json`，当前主要瓶颈分为两类：

- **首屏压力**：`core-js`、`i18next`、`react-dom` 占比高，首屏 parse/compile 与执行成本偏高。
- **非首屏重量级模块**：`highlight.js`、`micromark*`、`react-virtuoso` 体积显著，虽在 async，但仍会影响进入对应功能时的交互稳定性。

## 关键发现（按优先级）

1. **`node_modules/core-js` 在首屏占比最高（422KB 级别）**  
   已通过 `browserslist` 收敛获得一轮收益，但仍需继续确认 polyfill 注入策略是否可以更精细（按需与目标一致）。

2. **国际化与运行时基础库在首屏占比较大**  
   `i18next` / `react-i18next` 在首屏有明显体积，应评估是否可做语言包延迟加载、仅首屏必要命名空间预加载。

3. **Markdown 渲染链条在非首屏中偏重**  
   `highlight.js`、`micromark*`、`mdast*` 属于“内容增强”能力，适合进一步按需加载（按消息展开、按代码块可见时触发）。

## 下一步改进任务（建议直接排期）

## P1（高收益）

- [x] 对 Markdown 相关重模块做“用户触发式”动态导入：
  - 首次出现代码块再加载高亮
  - 非可见区域先不执行重解析
- [x] 把历史会话列表或重 UI 组件继续拆出独立 async chunk

> P1 已落地结果见：`P1_DYNAMIC_MARKDOWN_RESULT.md`
>
> P1.5（首屏关键链路 + static 压缩校准）结果见：`P1_CRP_STATIC_COMPRESSION_RESULT.md`

## P2（治理）

- 建立包体预算基线（首屏 Top20 总量、单模块上限）
- 每次合并前固定跑：
  - `npm run analyze:bundle:top20`
  - 生产口径 Lighthouse（同 URL）

## 验收指标建议

- 首屏 Top20 总量继续下降（至少 10%）
- Lighthouse `TBT` 继续下降（目标 <= 100ms）
- `LCP` 继续下降（目标 <= 5000ms）
