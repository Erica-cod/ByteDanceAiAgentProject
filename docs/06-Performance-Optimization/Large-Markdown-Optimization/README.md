# 大 Markdown 输入性能优化文档索引

## 目录目标

这个目录用于集中管理“大 Markdown 输入性能优化”相关资料，覆盖：

- 已完成改造（例如 Web Worker）
- 基准测试与 Lighthouse 对比分析
- 后续优化计划与阶段结论

## 文档清单

- `WEB_WORKER_OPTIMIZATION.md`：Web Worker 改造背景、实现点、收益
- `LIGHTHOUSE_BROWSERSLIST_ANALYSIS.md`：browserslist 调整后的 Lighthouse 同口径分析
- `OPTIMIZATION_ROADMAP.md`：后续优化路线图（含业界成熟方案映射）

## 推荐阅读顺序

1. 先看 `WEB_WORKER_OPTIMIZATION.md`，理解已完成的主线程减压动作
2. 再看 `LIGHTHOUSE_BROWSERSLIST_ANALYSIS.md`，确认当前瓶颈变化
3. 最后看 `OPTIMIZATION_ROADMAP.md`，按优先级推进后续工作

## 后续维护规范

- 每次性能改动后，都补充一份“改动说明 + 数据对比”到本目录
- 对比数据尽量保持同口径（同 URL、同网络、同机器、同运行模式）
- 关键结论统一落到本目录，避免信息散落在多个文件夹
