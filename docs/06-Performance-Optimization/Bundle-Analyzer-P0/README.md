# Bundle Analyzer P0

## 目标

建立可重复执行的 P0 分析流程，输出：

- 首屏 Top 20 大模块
- 非首屏 Top 20 大模块
- 基于结果的下一步优化建议

## 本目录内容

- `top20-modules.json`：原始分析结果（机器可读）
- `TOP20_MODULES_REPORT.md`：Top 20 清单报告
- `P0_ANALYSIS_AND_NEXT_ACTIONS.md`：P0 结论与后续改进任务
- `P1_DYNAMIC_MARKDOWN_RESULT.md`：P1 落地结果（组件差分 + 动态加载）

## 执行命令

```bash
npm run build
npm run analyze:bundle:top20
```

## 说明

- 分析脚本：`scripts/analyze-bundle-top20.js`
- 数据来源：`dist/static/js/**/*.js.map`
- 当前统计基于 source map 的模块内容字节，用于定位热点模块和拆分优先级
