# 跨 Tab 流式输出与发送队列设计说明

## 背景与问题

在同一浏览器多开 tab 的场景下，聊天系统会出现以下典型问题：

- 同一会话可能被多个 tab 同时发送，导致并发冲突。
- 队列消息可能被重复消费，出现重复发送。
- 切换会话时，流式输出可能串到当前会话 UI。
- 流式输出期间频繁刷新会话列表，导致侧边栏难以点击。

本次改造目标是：

- 保持服务端数据为唯一真相。
- 支持多 tab 协同，但避免重复发送和 UI 串流。
- 在交互层保证“可切换、不卡顿、可恢复”。

## 设计原则

- **事件通知与数据拉取分离**：跨 tab 只广播轻量事件，不广播完整数据。
- **会话级串行发送**：同一会话同一时刻只允许一个发送持锁者。
- **队列本地隔离**：队列按 tab 持久化，避免跨 tab 重复消费。
- **前台渲染、后台接收**：会话切后台时继续接收流，但不更新前台 UI。
- **切回补齐**：切回会话后一次性补齐并继续实时渲染。

## 模块结构

### 1) 跨 tab 事件总线

文件：`src/utils/events/crossTabChannel.ts`

职责：

- 优先使用 `BroadcastChannel`，降级到 `localStorage + storage` 事件。
- 提供统一发布与订阅接口。

主要事件：

- `conversation_updated`
- `conversation_list_updated`
- `conversation_send_released`

### 2) 会话发送锁

文件：`src/utils/events/conversationSendLock.ts`

职责：

- 用 `localStorage` 实现会话级锁。
- 锁粒度：`userId + conversationId`。
- 支持 TTL 和续租，避免僵尸锁。

### 3) 发送队列

文件：`src/stores/queueStore.ts`、`src/hooks/data/useMessageQueue.ts`

职责：

- 队列按 tab 隔离存储：`ai_agent_message_queue_${tabId}`。
- 队列处理使用 `isProcessing` 互斥，防重入。
- 锁冲突时进入 `waitingLock`，等待释放事件驱动下一次处理。

### 4) 流式渲染与后台缓冲

文件：`src/hooks/data/useSSEStream/index.ts`、`src/hooks/data/useSSEStream/raf-batching.ts`

职责：

- 流式更新改为按 `assistantMessageId` 精准更新，不再“更新最后一条消息”。
- 使用 `streamBufferRef` 缓存后台会话流式快照。
- 当前会话才渲染；后台会话仅接收并缓存。
- 切回会话时补齐缓存，并在未完成时恢复实时。

## 关键交互流程

### A. 多 tab 同会话发送

1. tab B 点击发送，尝试获取发送锁。
2. 若锁被 tab A 持有，tab B 进入本地队列并标记 `waitingLock`。
3. tab A 发送完成释放锁，并广播 `conversation_send_released`。
4. tab B 收到释放事件，匹配 `waitingLock` 后单次触发出队发送。

### B. 流式过程中切换会话

1. 会话 A 正在流式输出。
2. 切到会话 B 后，A 继续接收 chunk 但不更新当前页面。
3. 切回 A 时，从 `streamBufferRef` 一次性补齐，再继续实时。

### C. 会话列表刷新策略

- 流式期间收到 `conversation_list_updated` 只记录待同步标记。
- 流式结束后再执行一次节流刷新，避免侧栏频繁重绘打断点击。

## 这次修复覆盖的问题

- 修复跨 tab 队列重复发送。
- 修复队列处理并发重入导致的重复发送与卡顿。
- 修复切换会话时流式内容串流到错误会话。
- 修复流式阶段侧栏频繁刷新导致无法切换会话。
- 修复多 tab 下 CSRF token 被覆盖导致的 403 不匹配。

## 已知边界

- 当前锁与队列方案基于浏览器本地存储，适用于同设备同源多 tab 协同。
- 若未来需要跨设备共享队列/锁，需要引入服务端协调层（例如 Redis 分布式锁）。

## 方案对比与 Trade-off

### 1) 跨 tab 通信方案

| 方案 | 优点 | 缺点 | 本项目结论 |
|---|---|---|---|
| `BroadcastChannel` | 低延迟、实现简单、同源多 tab 原生支持 | 不持久化，旧浏览器支持有限 | **主通道** |
| `localStorage + storage` | 兼容性好、可作为兜底 | 事件语义弱、写频率高时有性能影响 | **降级兜底** |
| `SharedWorker` | 可集中连接管理 | 兼容性/调试成本高 | 暂不采用 |
| Service Worker 中转 | 能力强、可扩展离线 | 复杂度高，非当前痛点 | 暂不采用 |

## BroadcastChannel 原理确认（源码与规范）

### 核心结论

- `BroadcastChannel` 是浏览器内核提供的同源消息总线，语义是发布-订阅（pub/sub）。
- 消息在浏览器内部分发，不通过业务服务端中转。
- 发送者不会收到自己发送的消息；新加入上下文不会回放历史消息。

### 证据摘要

1. WHATWG HTML 规范定义了“broadcasting to other browsing contexts”机制。  
2. MDN 明确其作用域为“同源 + 同频道名”，并说明发送对象不包含发送者自身。  
3. Chromium `broadcast_channel.cc` 中可以看到：
   - 单线程共享 provider 并借助 associated interfaces 保证消息顺序。
   - `postMessage` 对消息做序列化（`SerializedScriptValue`）。
   - 收到消息后通过 `EnqueueEvent(..., DOMManipulation)` 异步投递。
4. Gecko `BroadcastChannelService` 实现中可见注册 actor、`PostMessage` 与按键组织管理。

## HTTP/1.1 连接上限与流式场景影响

### 容易混淆的点

- **不受连接上限影响**：`BroadcastChannel`（浏览器内部通信）  
- **受连接上限影响**：每个 tab 到服务端的 SSE/fetch 连接（网络连接）

### 风险说明

在 HTTP/1.1 下，同源并发连接数有浏览器实现上的上限（常见约 6）。  
当多 tab 同时建立 SSE/长连接时，可能出现：

- 新连接排队或阻塞
- 请求建立慢、超时或失败
- 页面体感卡顿

> 该上限是“常见实现行为”，不同浏览器/版本可能存在差异。

### 治理策略（优先级）

1. **优先启用 HTTP/2 或 HTTP/3**：利用多路复用减少 H1 连接瓶颈。  
2. **前端连接治理**：会话级锁 + 事件驱动队列，避免同会话并发打流。  
3. **后台 tab 降载**：后台仅收通知，不主动新建流连接。  
4. **服务端限流排队**：保留 `429 + queueToken`，避免重试风暴。  
5. **可选升级**：leader tab 单连接转发（复杂度更高，按需实施）。

### Nginx / 网关 H2 检查清单

- 确认监听开启 `http2`（TLS 入口通常为 `listen 443 ssl http2;`）。
- 证书链有效，浏览器侧协商协议为 h2（可在 DevTools Network 中查看 Protocol）。
- 反向代理链路中不要把 h2 降级回 h1（重点检查 CDN/WAF/Ingress 配置）。
- SSE 路由确认无错误缓存与缓冲策略（避免流式被代理层“攒包”）。
- 压测验证多 tab 流式并发下连接建立时间与错误率。

### 2) 发送并发控制方案

| 方案 | 优点 | 缺点 | 本项目结论 |
|---|---|---|---|
| 客户端会话锁（localStorage, TTL） | 开发快、无后端改造、满足同设备多 tab | 仅限同设备同源 | **当前采用** |
| 服务端分布式锁（Redis） | 跨设备一致性更强 | 引入基础设施与一致性运维成本 | 按需升级 |
| 纯时间轮询重试 | 实现简单 | 易刷屏、易卡顿、交互差 | 已弃用 |
| 事件驱动重试（释放信号） | 重试次数可控、交互稳定 | 需要事件协议设计 | **当前采用** |

### 3) 切换会话时流式渲染策略

| 方案 | 优点 | 缺点 | 本项目结论 |
|---|---|---|---|
| 始终实时渲染当前页面最后一条 | 代码最少 | 串流污染、切换错位 | 已弃用 |
| 切后台继续接收但不渲染，切回补齐 | 交互自然、不会串流、可恢复实时 | 需要维护后台缓冲 | **当前采用** |
| 切换即中断流 | 逻辑简单 | 用户体验差、与需求冲突 | 已弃用 |

## 为什么最终选这套实现

### 选型依据

- **一致性优先**：服务端数据库仍是唯一真相，跨 tab 只传事件，不传业务真值。
- **复杂度可控**：不引入 Redis 即可解决同设备多 tab 的核心冲突。
- **交互优先**：流式期间保证侧栏可点击，切后台不串流，切回可补齐并恢复实时。
- **可演进**：后续如需跨设备锁/队列，可平滑升级到服务端分布式协调。

### 放弃其他方案的原因

- 放弃“固定时间轮询”：在锁冲突时容易出现高频日志、页面卡顿、难以控制重试风暴。
- 放弃“全量本地缓存同步”：会引入本地真值歧义，和服务端一致性策略冲突。
- 放弃“切换即 abort”：不符合“切换后原会话继续输出”的业务目标。

## 参考资料

### 官方与标准文档

- [MDN - BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)
- [MDN - Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)
- [WHATWG HTML - Broadcasting to other browsing contexts](https://html.spec.whatwg.org/multipage/web-messaging.html#broadcasting-to-other-browsing-contexts)

### 工程实践与库

- [pubkey/broadcast-channel](https://github.com/pubkey/broadcast-channel)
- [react18-tools/zustand-sync-tabs](https://github.com/react18-tools/zustand-sync-tabs)
- [npm - zustand-sync-tabs](https://www.npmjs.com/package/zustand-sync-tabs)

### 本项目相关文档

- `docs/03-Streaming/README.md`
- `docs/03-Streaming/STREAM_RESUME_GUIDE.md`
- `docs/03-Streaming/CRITICAL_FIX_CONNECTION_ABORT.md`
- `docs/08-Data-Management/LRU_DATA_MANAGEMENT.md`

## 后续建议

- 为队列事件与锁状态补充埋点（锁冲突率、平均等待时长、重复发送率）。
- 为关键并发场景增加自动化集成测试（双 tab 模拟）。
- 将跨 tab 事件类型收敛为常量枚举，降低拼写错误风险。
