## 虚拟列表 / 重试队列 / 本地加密 / 分片上传（面试扫读版）

---

## 1) 虚拟列表怎么做的？实现时有 bug 吗？

### 一句话答案

我把消息列表从 `react-virtualized` 迁移到 `react-virtuoso`，核心是为了解决“**动态高度 + 流式输出**”的稳定性；迁移后确实遇到过“默认不在底部”和“流式/输入/开设置会闪”的问题，最终用 **followOutput + 稳定 key + 避免 setState 回路 + 稳定引用** 把它彻底压住。

### 我遇到的线上问题（体验级）

- **问题 1**：进入对话默认不在底部（不跟最新消息）
- **问题 2**：流式输出会闪；甚至输入框打字、打开设置面板也会让列表闪

### 排查路径（面试官喜欢听的“诊断方法”）

- **先判定是 remount 还是 rerender**：用 React DevTools 更新高亮观察“输入/开设置”这种与消息无关操作是否触发列表更新  
  - 结果：列表在频繁 rerender，说明是“渲染链路不稳定/引用不稳定”，不是数据本身的问题。

### 最终修复（分 3 类问题逐个击破）

- **滚动策略问题**
  - 之前：在消息高度变化回调里强制 `scrollToIndex`，流式每个 chunk 都改变高度 → 频繁布局 + 滚动联动 → 视觉闪烁
  - 之后：改用 Virtuoso 原生 **`followOutput`**（“在底部时才自动跟随”）  
  - 同时：设置稳定 `computeItemKey=message.id`，避免 diff 不稳

- **状态自激（setState 回路）**
  - 之前：`atBottomStateChange` 触发频繁，在里面 `setState` → “布局变化 → setState → rerender → 再布局变化”循环
  - 之后：用 **ref** 记录 `atBottom`，不再触发 React state；并把 `followOutput/Scroller` 做成稳定引用

- **函数 props 不稳定**
  - 之前：父组件输入会 rerender，`useSSEStream/useMessageSender` 返回的函数每次都是新引用 → item renderer 变化导致整片重绘
  - 之后：关键函数全部 `useCallback` 固定 + 列表组件 `React.memo`，确保输入框变化不会刷新列表

### 最终效果（可以直接作为成果句）

- 进入对话默认停在最新消息
- 流式输出不再闪
- 输入/开设置也不会影响列表稳定性

> 本质结论：在“虚拟列表 + 流式高频更新”场景，必须组合 **followOutput + 稳定引用 + 避免 setState 回路** 才能稳。

---

## 2) react-virtuoso 原理怎么讲？

- **动态高度测量**：item 渲染到 DOM 后读取真实布局高度，并缓存 `itemKey → height`；滚动/复用时用缓存估算位置，必要时增量修正。
- **锚定滚动（保持位置/跟随输出）**：高度变化时以视口锚点 item 为基准补偿 `scrollTop`，让用户视觉停在原位置；用户处于底部时启用 `followOutput` 自动跟随最新消息。

---

## 3) 为什么不用 react-virtualized / react-window？为什么不手写？

### 为什么不用 react-virtualized

- **维护状态**：社区维护基本停滞，类型/兼容性风险越来越高。
- **聊天场景痛点**：动态高度 + 频繁追加 + 底部跟随要写很多 glue code，容易和滚动/测量打架。

### 其他成熟方案为什么没选

- **react-window**：更轻，但对“可变高度 + 自动测量 + chat follow 输出”支持没 Virtuoso 省心，仍要自己补很多逻辑。

### 为什么不手写

聊天虚拟列表的坑很多，手写要长期维护：

- 滚动锚定/保持当前位置（用户在中间看历史时，高度变化不应跳动）
- 动态高度测量与缓存（Markdown/代码高亮/图片加载）
- 高频流式更新下的性能治理
- 跨浏览器兼容与可访问性

用成熟库（Virtuoso）相当于把“最难、最容易出坑的部分”交给社区验证过的实现；我们只要把业务侧的“跟随策略、状态隔离、引用稳定”做好。


指数退避+抖动+服务端重试队列，有参考方案吗？

指数退避 + Jitter：成熟方案/开源对标
你们把“退避上限 10s + jitter”做成客户端重试规范，本质上等价于这些成熟库/云 SDK 的 best practice（区别只是工程形态不同）。
- AWS SDK / 云厂商重试策略：基本都内置“指数退避 + 抖动（jitter）”来防止惊群；思路和你们的 2^n + jitter + maxDelay 一致，区别主要在 jitter 选型（Full/Equal/Decorrelated）。
- Resilience4j（Java）：Hystrix 之后更现代的容错库，Retry/RateLimiter/Bulkhead/CircuitBreaker 都是“装饰器链”思路。resilience4j GitHub
- Spring Retry（Java）：注解化重试（@Retryable）+ backoff 配置，常见于业务系统快速落地。

“429 + Retry-After + 队列位置 Token（保持排队位置）”：成熟方案/开源对标
大多数成熟网关只做到“拒绝+建议重试”，你们做到“拒绝+排队令牌保持位置+可视化队列位次”，更像 Waiting Room 产品形态。这块在业界通常叫 Virtual Waiting Room / 排队系统 / Admission Control（准入控制），核心目标和你们一致：服务满了也别让客户端乱冲，先排队、可观测、可恢复。
- Queue-it（商业成熟方案）：典型“虚拟候车室”，靠 cookie/token 维持排队身份与位置，放行时再进入真实服务；和你们“队列位置 Token + 前端展示排队位次”非常像。（面试可说：行业里电商抢购/活动高峰常用这类方案）
- API Gateway / 反向代理限流（NGINX/Envoy）：常见做法是限流后返回 429/503 + Retry-After，但一般不负责“保持队列位置”（你们比网关限流更进一步，属于“带状态的排队系统”）。

“LLM 内部优先级队列 + 并发 & RPM 双限制”：成熟方案/开源对标
你们把“Agent 角色优先级（Host > Planner > Critic > Reporter）+ 并发限制 + RPM 限制”内聚成调度策略，属于“面向 LLM 的工作负载调度器”，和通用队列相比更业务贴合。这块属于 Job Queue + Priority Scheduling + Rate Limiting 的组合，业界成熟度非常高：
- BullMQ（Node/Redis）：支持基于 Redis 的队列体系，天然适合做“LLM 请求队列”，并能扩展优先级、并发控制等能力。taskforcesh/bullmq GitHub
- Celery（Python）/ Sidekiq（Ruby）：经典异步任务队列生态，常配合“优先级队列/多队列/限速”做调度与削峰（你们第二层队列就是这种思路）。
- Kafka/RabbitMQ/RocketMQ：更偏“消息中间件”，适合更重的削峰填谷与解耦；你们当前更像“应用内调度器”，不一定需要上这么重的组件。


怎么单机跨浏览器防重试刷队列的？

使用不挂DOM上面的不可见canvas绘制文本（字体渲染差异）-》导出图像数据并 Hash，不把 Canvas 结果当“明文指纹”存/传，而是把它和 GPU/屏幕/时区等一起做“特征集合”，再做单向 Hash，得到一个稳定的 deviceIdHash。同一台机器在 Chrome/Edge/Firefox 上，这些底层渲染与硬件信息高度一致，所以 Hash 也高度一致。抖音/cloudflare也使用这些方法

本地数据怎么加密的？

这段 `deviceCrypto.ts` 就干一件事：把本地缓存“绑在设备上加密”，拷走也尽量解不开。
- Key 怎么来：收集设备特征（屏幕/时区/语言/GPU/Canvas/UA/platform）→ 拼成字符串 → 用 PBKDF2(SHA-256, 100k) 派生出 AES 256 位密钥（密钥不落盘，每次现算）。
- 怎么加密：每次加密生成 随机 IV 12 字节 → 用 AES-256-GCM 加密（自带完整性校验，密文被改会解不开）。
- 怎么存：把 iv + 密文 转成 Base64，再用 JSON 包一层（带 `version` 方便升级）。
为什么这么选（两句话）
- PBKDF2：让“猜密钥”更慢，提升离线暴力破解成本（比直接 hash 强）。
- AES-GCM：业界标准 + 带认证（防篡改），浏览器 WebCrypto 原生支持，踩坑少。
 trade-off（必须会说）
- 优点：不用用户密码/登录、密钥不存储、数据绑设备。
- 缺点：设备特征变了可能解不开旧数据（安全性 vs 可恢复性）。
参考/成熟方案一句话
- 参考 WebCrypto + OWASP/NIST 的通用实践：KDF（PBKDF2）+ AEAD（AES-GCM）+ 随机 IV

补一句“面试官可能追问”的点（你可以这样答）
- 为什么不用 IP：IP 变化太频繁，会导致无法解密旧数据；而且浏览器端也拿不到可信公网 IP，所以不放进指纹源（代码里也明确注释了）。
- 为什么是 PBKDF2 而不是 bcrypt/Argon2：WebCrypto 原生支持 PBKDF2，兼容性/性能/实现复杂度更适合前端；Argon2 通常需要额外 wasm/库引入，成本更高。



压缩传输和大文件分片传输（含断点续传）实现总结。

压缩传输（10KB–5MB）：怎么做的？

1）策略选择（按文本长度）
在 src/utils/uploadStrategy.ts 里按阈值选择上传方式：

- < 10KB：直接上传（direct）
- 10KB – 5MB：压缩上传（compression）
- > 5MB：先压缩，压缩后若仍 > 5MB，则走分片（chunking）
  
对应阈值在 src/constants/uploadThresholds.ts：
2）压缩实现（浏览器原生 gzip）
压缩在前端完成，使用浏览器原生 CompressionStream('gzip')，把文本压成 Blob：
3）压缩上传接口（单次请求，不分片）
前端把压缩 Blob 作为 FormData 上传到 /api/upload/compressed：

export async function uploadCompressedBlob(blob: Blob, userId: string): Promise<string> {
  const formData = new FormData();
  formData.append('userId', userId);
  formData.append('data', blob);
  formData.append('isCompressed', 'true');

  const response = await fetch('/api/upload/compressed', {
    method: 'POST',
    body: formData,
  });

  const result = await response.json();
  return result.sessionId;
}

后端 api/lambda/upload/compressed.ts 做的事是：
- 把 Blob 转成 Buffer
- 创建一个单分片会话（totalChunks = 1）
- 计算 sha256 hash
- 保存 chunk（index=0）
  
注意：这里的“压缩传输”不是 HTTP 层 Content-Encoding:gzip，而是应用层 gzip blob 上传（更可控，也更容易和分片/断点续传统一在一套 upload session 里）。

大文件分片传输（> 5MB）：怎么做的？

0）整体策略：先压缩，再分片
在 handleMessageUpload（src/hooks/data/useSSEStream/upload.ts）里，chunking 分支是先 compressText(messageText)，然后把 压缩后的 Blob 交给 ChunkUploader.uploadLargeBlob。

} else if (uploadDecision.strategy === 'chunking') {
  const compressedBlob = await compressText(messageText);

  const sessionId = await ChunkUploader.uploadLargeBlob(compressedBlob, {
    userId,
    onProgress: (percent, uploaded, total) => {
      options.updateProgress(`上传中... ${percent}% (${uploaded}/${total} 个分片)`);
    },
    onError: (error, chunkIndex) => {
      console.error(`分片 ${chunkIndex} 上传失败:`, error);
    },
  });

  uploadPayload = { uploadSessionId: sessionId, isCompressed: true };
}

1）分片大小与原因
分片大小固定 50KB（注释里写了“模型友好的大小”，后端可以直接喂模型无需再分片）：

CHUNK_SIZE: 50 * 1024,

2）前端分片上传器（含 hash 校验、失败重试、断点续传）
核心实现是 src/utils/chunkUploader.ts：

- 按 50KB slice Blob
- 每片计算 SHA-256 hash（calculateHash）
- POST /api/upload/chunk 上传：sessionId + chunkIndex + chunk + hash
- 每片失败会重试（最多 3 次，带延迟）
- 支持断点续传：先 GET /api/upload/status/:sessionId 获取已上传片段，跳过已完成片
  
你可以重点看这几段：
- createSession: POST /api/upload/session
- getUploadStatus: GET /api/upload/status/:sessionId
- uploadChunk: POST /api/upload/chunk
- completeUpload: POST /api/upload/complete
  
3）后端接口与会话机制
后端接口在 api/lambda/upload/*：

- POST /api/upload/chunk：api/lambda/upload/chunk.ts  
  - 接收 FormData（sessionId/chunkIndex/hash/chunk）
  - 转 Buffer
  - 调用 use-case 保存 chunk 并校验 hash
  - 返回 verified: true/false
    
- GET /api/upload/status/:sessionId：api/lambda/upload/status/[sessionId].ts  
  - 返回 uploadedChunks / isComplete / progress，供前端断点续传
    
- POST /api/upload/complete：api/lambda/upload/complete.ts  
  - 先检查分片是否齐全
  - 组装分片（assemble）
  - 返回 assembled 总大小（供后续处理）
更细一点：分片请求级别的“断线”怎么处理？
    每个分片上传都是一次独立的 POST /api/upload/chunk。如果这次请求中途断了（网络断/用户关页），后端不会把该 chunkIndex 写进 uploadedChunks（因为只有在写入成功 + hash 校验通过后才会 markChunkUploaded）。客户端下次查 /status 就会发现它仍是缺片，然后补传。
小结（你面试可用的一句话）
    - 完成：靠客户端显式 complete（后端只在 isComplete=true 时组装）。
    - 断线/放弃：靠 session 的 updatedAt + TTL 超时回收（后端不需要实时判断“断线”，只需要最终一致）。

---

你面试时一句话总结
- 压缩传输：前端用浏览器原生 CompressionStream('gzip') 把中等文本压成 gzip Blob，通过 /api/upload/compressed 走“单分片 upload session”上传。  
- 分片传输：超大文本先 gzip，再按 50KB 分片，前端每片算 SHA-256，走 /api/upload/session → /api/upload/chunk → /api/upload/status → /api/upload/complete，支持重试与断点续传。