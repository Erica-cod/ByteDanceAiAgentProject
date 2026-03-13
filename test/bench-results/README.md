# 基准结果归档说明

本目录用于归档前端输入链路性能基准结果（Playwright）。

## 文件命名

- `input-paste-bench-<timestamp>.json`

示例：

- `input-paste-bench-1773369487777.json`
- `input-paste-bench-1773370464521.json`

## 数据来源

由以下脚本生成：

- `scripts/bench-input-paste-playwright.js`

常用执行命令：

```bash
APP_URL=http://localhost:8080 REPEAT=5 CPU_PROFILES=1,4 CASE_SIZES=100,5000,20000,100000 npm run bench:input:paste
```

## 重点关注指标

- `inputDispatchMs.p95`：输入事件到稳定更新的耗时（主参考）
- `nextPaintMs.p95`：输入后到下一帧绘制耗时（更接近体感）
- `maxLongTaskMs.p95`：主线程最长长任务（是否超过 50ms）
- `comparison.deltaVsBaseline`：相对 baseline（最小文本）的增量

## 回归判断建议

- `inputDispatchMs.p95 <= 100ms`
- `nextPaintMs.p95 <= 100ms`
- `maxLongTaskMs.p95 <= 50ms`

如果 `evaluation.overallPass=false`，建议结合 `raw` 明细排查：

- 是否是固定背景开销（各 case 接近）
- 是否随文本大小线性恶化（大 case 明显变差）

