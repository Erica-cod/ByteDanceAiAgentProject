# 大 Markdown 性能基准指南

## 目标

统一评估“大量 Markdown 输入”场景下的性能变化，对比优化前后数据。

建议同时看两条链路：

- 输入链路（前端）：粘贴后是否卡顿
- 发送链路（后端+模型）：TTFB/TTC 是否改善

## 1) 输入链路基准（Playwright）

脚本：`scripts/bench-input-paste-playwright.js`

### 安装浏览器（首次）

```bash
npx playwright install chromium
```

### 运行

```bash
APP_URL=http://localhost:8080 REPEAT=5 CASE_SIZES=5000,20000,100000 npm run bench:input:paste
```

可选参数（推荐）：

```bash
CPU_PROFILES=1,4 CASE_SIZES=100,5000,20000,100000 INPUT_P95_BUDGET_MS=100 NEXT_PAINT_P95_BUDGET_MS=100 MAX_LONG_TASK_P95_BUDGET_MS=50 npm run bench:input:paste
```

### 输出指标

- `inputDispatchCostMs`：设置输入并触发 `input` 事件后的耗时
- `nextPaintMs`：输入事件后到下一次绘制的耗时（更接近交互体感）
- `settleCostMs`：等待 UI 稳定阶段耗时（默认 200ms 窗口）
- `longTaskCount`：长任务次数（>50ms）
- `longTaskTotalMs`：长任务总时长
- `maxLongTaskMs`：单次最长长任务

脚本会输出 JSON 到 `bench-results/`，包含：

- 每个 CPU 配置（如 `cpu_1x`、`cpu_4x`）的结果
- 每个 case 相对 baseline（最小文本）的 delta
- 自动达标判断（PASS/WARN）

## 2) 发送链路基准（k6）

脚本：`test/k6/chat_sse_large_markdown.js`

### 运行

```bash
BASE_URL=http://localhost:3000 ORIGIN=http://localhost:8080 VUS=2 ITERATIONS=6 CASE_SIZES=5000,20000,100000 npm run bench:k6:chat:large-markdown
```

### 输出指标

- `chat_ttfb_ms`：首字节时间（`res.timings.waiting`）
- `chat_total_ms`：总耗时（`res.timings.duration`）
- `chat_response_body_bytes`：响应体大小
- `http_req_failed`：请求失败率

说明：

- 脚本会先请求 `/api/auth/csrf`，再携带 `X-CSRF-Token` 调 `/api/chat`
- 状态码接受 `200/429`，429 表示排队限流触发

## 3) 推荐对比方法

- 固定测试样本：`5k / 20k / 100k / 真实1万条 markdown`
- 每组至少跑 10 次，看 `P50/P95`
- 对比前后版本：
  - 输入卡顿：`longTaskTotalMs`、`maxLongTaskMs`
  - 发送链路：`chat_ttfb_ms`、`chat_total_ms`

建议通过标准（可按团队调整）：

- 输入链路 `longTaskTotalMs` 下降 >= 40%
- 发送链路 `chat_total_ms` 下降 >= 20%
- 失败率 `http_req_failed < 5%`
