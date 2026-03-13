# Web Worker 改造记录（大文本检测）

## 背景

在输入框粘贴超大文本（例如 1 万行 Markdown）时，主线程同步执行文本统计逻辑会引入明显卡顿风险。

原先 `TextStatsIndicator` 依赖同步 `isLongText()` 计算，随着文本变大，主线程负担上升，长任务增多。

## 改造目标

- 将重计算从主线程迁移到 Worker
- 在不改变业务逻辑的前提下，降低输入阶段长任务
- 保持小文本场景响应速度，不引入额外通信开销

## 关键实现

### 1) 新增 Worker

- 文件：`src/workers/textStats.worker.ts`
- 职责：接收文本并执行 `isLongText()`，回传检测结果

### 2) 新增 Hook

- 文件：`src/hooks/interaction/useLongTextDetection.ts`
- 策略：
  - 小文本：主线程同步计算（减少 worker 往返成本）
  - 大文本：延迟投递到 Worker 计算（默认 120ms 防抖）
  - 使用序列号避免过期响应覆盖最新输入

### 3) 接入组件

- 文件：`src/components/old-structure/TextStatsIndicator.tsx`
- 变化：从直接调用 `isLongText()` 改为使用 `useLongTextDetection()`

## 已观测收益（输入链路）

在已有基准中，迁移后长任务指标明显改善：

- `longTaskTotal p95`：约 `203ms -> 125ms`
- `maxLongTask p95`：约 `105ms -> 70ms`

说明：主线程确实被释放，输入时“卡住一下”的概率下降。

## 当前结论

- Web Worker 方案是正确方向，且已带来可量化收益
- 后续仍需继续压缩首屏 JS 与非关键执行，才能进一步降低 TBT/LCP
