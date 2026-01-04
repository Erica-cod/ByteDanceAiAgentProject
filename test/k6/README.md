### k6 压测说明（性能 / 限流 / 队列）

#### 前置条件

- **服务已启动**：默认 `http://localhost:3000`
- **推荐为“队列测试”设置更小的并发阈值**（更容易稳定触发 429）：

```bash
MAX_SSE_CONNECTIONS=2 MAX_SSE_CONNECTIONS_PER_USER=1 npm run dev
```

> Windows PowerShell 可用：
>
> `setx MAX_SSE_CONNECTIONS 2`（需要重开终端）
>
> 或直接在 `.env.local` 配置后重启服务

---

#### 1) 冒烟测试（验证接口可用）

```bash
BASE_URL=http://localhost:3000 npm run load:k6:chat:smoke
```

---

#### 2) 队列/限流压测（验证 429 + Retry-After + 队列 Token）

```bash
BASE_URL=http://localhost:3000 VUS=10 DURATION=20s npm run load:k6:chat:queue
```

---

#### 说明

- `/api/chat` 是 **SSE 流式接口**，请求会持续一段时间；压测时要关注：
  - **200**：正常进入流式
  - **429**：触发队列/限流，应带 `Retry-After` + `X-Queue-Token`（可选 `X-Queue-Position`、`X-Queue-Estimated-Wait`）


