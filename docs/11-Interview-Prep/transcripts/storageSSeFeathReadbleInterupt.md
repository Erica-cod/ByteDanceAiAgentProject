## 状态管理 / SSE / 中断控制（面试扫读版）

> 目标：每个问题都能先给 **一句话答案**，再按点展开，最后能落到 **项目证据（代码位置）**。

---

## 1) 为什么状态管理选 Zustand，不用 Pinia / Redux / useContext？

### 一句话答案

这个项目选 **Zustand** 是因为它 **足够轻、API 简单、订阅粒度细**，特别适合“聊天 + 流式高频更新”的场景；Redux 心智/样板更重，Context 容易造成大范围重渲染；Pinia 属于 Vue 生态（本项目是 React/Modern.js）。

### 展开（你项目里的真实决策点）

- **高频流式更新**：`chatStore` 里有类似 `appendToLastMessage` 的更新路径，Zustand 更容易做到“谁用谁刷”，避免整棵组件树跟着抖。
- **store 脱离组件也能工作**：例如监听 `storage/online/offline` 后直接 `useStore.getState()` 更新（`chatStore.ts`、`queueStore.ts` 这类写法很顺）。
- **持久化/恢复简单**：主题用 `persist`（`themeStore.ts`），队列用 localStorage（`queueStore.ts`），实现成本低且清晰。

### 为什么不用 Redux（含 RTK）

- **样板/约束偏重**：即使用 Redux Toolkit，仍偏“全局单一数据源 + action/reducer 流程”，对本项目这种“UI 状态 + 聊天状态 + 队列状态”的组合来说偏重。
- **更容易写出粗粒度更新**：聊天流式更新频率高，一旦“大对象更新 → selector 不严格”，就容易导致大片组件刷新。

### 为什么不用 useContext/Context

- **性能风险更高**：Context 的 value 变化会让消费该 Context 的组件更容易被动刷新；聊天流式更新会放大这个问题。
- **Zustand 的优势是按需订阅**：组件只订阅关心的 slice（selector），更新更可控。

### 项目证据（代码落点）

- `src/stores/chatStore.ts`（流式更新/内存保护/异步 actions）
- `src/stores/themeStore.ts`（persist）
- `src/stores/queueStore.ts`（离线队列）

---

## 2) AbortController 怎么用？除了它还了解哪些取消方案？

### 一句话答案

我用 **AbortController + signal** 给 fetch 注入“可取消能力”，需要取消时直接 `abort()`；相比 axios 的 `CancelToken`，AbortController 是 **fetch 原生支持**、语义更清晰，而且在“分片上传/多请求并发”场景更不容易踩闭包引用导致的资源占用问题。

### 展开要点

- **标准用法**：创建 `AbortController` → 把 `controller.signal` 传给 fetch → 需要取消就 `controller.abort()`。
- **为什么不推荐 CancelToken**：
  - fetch 原生只认 AbortController
  - CancelToken 历史包袱大，容易出现“取消回调持有引用”的问题（并发请求多时更明显）
  - 生态上也更推荐向 AbortController 收敛

---

## 3) 为什么用 SSE，不用 WebSocket？

### 一句话答案

AI 输出是典型的“服务端 → 客户端”的单向流式，**SSE 更贴合场景**，部署更简单、穿透代理更稳、重连也更自然。

### 对比点（面试官常追问）

- **方向**：SSE 单向足够；WebSocket 双工是能力过剩。
- **部署/代理**：SSE 基于 HTTP，更容易过 CDN/反向代理/企业网关；WebSocket 更容易被环境限制。
- **重连**：SSE/HTTP 流更容易做“断点续传 + 重新请求”；WebSocket 往往需要更复杂的状态机。

### 项目证据

- `docs/03-Streaming/README.md`（SSE vs WebSocket 的面试要点）
- `api/lambda/chat.ts`（`TransformStream` + `text/event-stream` 返回 SSE）

---

## 4) 为什么前端用 fetch + ReadableStream，不用 EventSource？

### 一句话答案

因为我需要 **POST body + 队列 token + 上传会话参数 + AbortController 取消**，这些 EventSource 天然不支持或很别扭；用 fetch 读 `ReadableStream` 我能完全掌控协议解析、重试与取消。

### 展开

- EventSource 只能 GET，难以携带复杂 JSON body（你们 `/api/chat` 是 POST，参数很多：`mode/modelType/deviceId/queueToken/uploadSessionId/...`）。
- `response.body.getReader()` 可以自定义解析 `data:` 行、重试策略与取消逻辑。

### 项目证据

- `src/hooks/data/useSSEStream.ts`（POST `/api/chat` + ReadableStream 解析；支持 429 队列、指数退避重连、AbortController）

---

## 5) 为什么不用现成 SSE SDK / fetch EventSource polyfill？

### 一句话答案

我这里不是“GET-only 的 EventSource 场景”，而是“**POST + 复杂参数 + 上传会话 + 自定义重试/队列协议**”，自己用 fetch 解析流最可控、也最贴合业务。