
STAR 法则版本（把“ReadableStream 不自动重连 → 队列化防惊群”的故事讲完整）
S（Situation 情境）
我们的聊天采用 fetch + ReadableStream 做流式输出（因为是 POST，需要携带 modelType / mode / clientMessageId 等参数，原生 EventSource 不方便）。  
但 ReadableStream 不会自动重连，在网络抖动、服务重启、代理超时等场景下，流会中断，用户看到回答卡住或失败。

T（Task 任务）
把流式体验做到“像 ChatGPT 一样稳”：
- 断线自动恢复：尽量自动重连继续生成
- 内容不丢：已生成的部分要保留（刷新也能看到）
- 高并发稳定：避免大量用户同时重连导致 429 抖动（惊群效应）429 Too Many Requests
- 可解释：用户知道自己在排队、要等多久
  
A（Action 行动）
我按“从体验问题 → 稳定性问题”的顺序分 4 轮迭代：

- A1：前端补齐 ReadableStream 重连能力
  - 在未收到 [DONE] 时进入重连循环
  - 使用 指数退避并支持服务端 Retry-After，介绍一下其他方法
  固定间隔重连（Fixed Interval）
  缺点：服务端故障时会持续施压；大量客户端同时重连更容易“同步撞车”。
  线性退避（Linear Backoff）
  缺点：增长太慢，故障持续时仍可能产生较高重试频率；在大规模客户端下仍可能压测服务端。
  指数退避但不加抖动（No Jitter）
  缺点：所有客户端的退避节奏一致，容易“同频重连”，重连风暴依然可能发生。
  你们现在做得对：加了随机 jitter（0–250ms）能显著减少同步重连。
  基于服务端建议的自适应（Server-Driven Backoff）
  做法：服务端返回 Retry-After / 自定义 header（或 SSE event）告诉客户端多久再连。
  优点：最贴合服务端负载，保护服务端最强。
  缺点：需要服务端统一实现与治理；不同错误类型要设计不同策略。
  你们已经部分具备：429 时按 Retry-After。
  “续传”式重连（Resume / Last-Event-ID）（SSE 标准能力）
  做法：服务端按 event id 重放缺失段，客户端带 Last-Event-ID 重连。
  优点：用户体验最好（真正续传）。
  缺点：服务端要维护事件缓存/offset，复杂度更高；对你们这种 token 流还要设计事件粒度和去重。
  你们当前策略：UI 上“看起来续传”，但本质是重连后重新生成/继续推送，工程复杂度低。
  熔断/降级策略（Circuit Breaker）
  做法：连续失败后暂停一段较长时间，提示用户“稍后再试/点按钮重试”。
  优点：彻底避免无意义重试，保护服务端与用户电量。
  缺点：恢复不够“自动”。
  你们其实也有：最大重试次数达到就停止并报错。
  UI 上只更新 thinking 提示“正在重连”，不清空已生成内容（增量追加）
    
- A2：服务端兜底资源释放 + 中断内容持久化
  - 流写入用 safeWrite 捕获客户端断开（AbortError 等）：
  介绍saftWrite:
  1）写入前先快速判断连接状态
  isStreamClosed === true 直接返回 false，避免重复写入。
  2）真正写入 SSE 数据
  writer.write(encoder.encode(data))：把字符串编码成字节写入响应流。
  3）捕获“客户端断开”类异常并降级处理
  如果是 AbortError / ABORT_ERR / ERR_STREAM_PREMATURE_CLOSE：
  认为是正常的客户端断开场景
  把 isStreamClosed = true
  返回 false（告诉上层：别再写了，可以收尾了）
  4）非预期异常继续抛出
  这类是真 bug 或底层 IO 问题，交给外层 catch 去记录/处理。
  - 在 finally 做两件事：
    - 释放 SSE 并发名额（避免长连接泄漏）
    - 保存不完整回答到数据库（即使中断，已生成内容也入库，刷新可见）
      
- A3：识别并解决“惊群效应”
  - 压力上来后发现：大量客户端在同一秒重连 → 服务端频繁 429 → 形成抖动
  - 仅靠固定 Retry-After 可能让大家“同秒再来”，问题会放大
     引入队列化（MVP 内存版）+ token，错峰重试
- 当并发满时，不只是返回 429，而是返回：
  - X-Queue-Token（排队身份）
  - X-Queue-Position（队列位置）
  - Retry-After = ceil(position / rate) + jitter（天然错峰 + 防同秒重试）
- 前端在 429 时读取 X-Queue-Token 保存，并在下一次请求体里回传 queueToken，保证“你还是原来的排队请求”，公平且稳定
- 同时在 UI 展示“前面还有 N 个请求，预计等待 M 秒”，提升可解释性
  有了解过其他方法吗：
  “有了解过。解决惊群常见几类：客户端侧用指数退避 + jitter打散重试；服务端侧做Retry-After 随机化、令牌桶/漏桶限流、或者分批放行；系统侧用缓存/CDN、以及对热点请求用 singleflight 合并减少回源。我们最终选队列化是因为这是 SSE 长连接场景：大量客户端断线后同时重连，单靠 jitter 只能打散但不保证公平，也很难给用户一个明确预期。队列化能做到先来先服务，给每个请求一个 token 保持队列位置，并按 ceil(position / rate) + jitter 计算差异化 Retry-After，从机制上避免同秒重试，同时还能在前端展示‘前面还有 N 个、预计等待 M 秒’，体验更可解释。当然队列化的代价是更有状态、实现更复杂，所以我们采取渐进式：先实现退避重连 + Retry-After，验证高并发下确实会抖动后再上队列。MVP 用内存验证效果，生产可以升级 Redis ZSET + Lua 原子化，并通过 token 签名、每用户限额、TTL、取消接口和队列上限来防滥用和做运维。”
  - A4：防止恶意发送多个无效token：新增的队列 token 机制也存在被恶意伪造/刷无效 token 导致队列膨胀的风险。
方案 A（推荐）：按 session/tab 维度限队列项 + 每用户上限
  - 前端生成一个 clientSessionId（每个 tab 独立，存 sessionStorage），随请求带上。
  - 后端队列 key：queueKey = userId + ':' + clientSessionId
  - 效果：
  - 同一个用户开 3 个 tab → 允许排 3 个不同队列项（不误伤）
  - 但你可以设置 每 userId 最多 N 个队列项（比如 3 或 5），防止单用户无限刷爆队列
  面试话术：“我们不做绝对 1 个，而是每用户设置合理上限，并用 tab/session 维度区分正常并发。”
方案 B：按 conversationId 限队列项（更贴近业务）
  - queueKey = userId + ':' + conversationId
  - 同一用户在不同对话里并发是合理的；同一对话里重复刷同样请求就会被复用/节流。
  - 缺点：新开对话会增加队列项，仍需要每用户上限兜底。
方案 C：仍按 userId 复用，但只在“无效 token 高频”时惩罚（最终实现）
  - 正常多窗口：各自拿到合法 token 后重试即可。
  - 对“持续发不存在 token”的行为：触发 cooldown/限频，甚至直接 400，不再“无效 token → 新入队”。
  - 对同一 userId 在 10 秒内多次提交不存在 token 的行为触发冷却期并拒绝入队，防止恶意刷队列但不影响持有合法 token 的正常多窗口用户；
  第 1 次: 发送 fake_token_1 → 记录无效尝试 (count=1)
  第 2 次: 发送 fake_token_2 → 记录无效尝试 (count=2)
  第 3 次: 发送 fake_token_3 → 🚫 触发惩罚，返回 rejected: true，冷却 30 秒
  第 4 次: 任何请求 → 🚫 仍在冷却期，拒绝入队
R（Result 结果）
- 体验层：断线后能自动重连，已生成内容不会回滚；即使中断也会落库，刷新仍能看到部分回答
- 稳定性：在降低 MAX_SSE_CONNECTIONS=3 的压测中：
  - 10 并发请求 → 3 个进入流式，7 个进入队列
  - 队列 position 正确递增，Retry-After 随位置递增且带 jitter，避免同秒重连
  - 携带 token 重试可以成功获得名额（token 重用生效）
- 工程化：MVP 用内存实现便于快速验证，方案天然可升级到 Redis ZSET + Lua 原子化支撑多实例
  
拓展：实际
