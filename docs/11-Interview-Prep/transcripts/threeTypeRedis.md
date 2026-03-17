## Redis 为什么快（结合你项目的角度）

- **内存读写**：核心数据在内存，避免磁盘 IO，天然就比落盘型存储快一个量级。
- **数据结构原生**：不仅是 KV，还支持 Hash/List/Set/ZSet 等，很多业务操作可以用“原子命令”一次完成，减少多次查询与应用层拼装。
- **单线程事件循环**：命令执行主要单线程，避免锁竞争与线程切换；配合高效 I/O 多路复用，吞吐很高、延迟稳定。
- **网络与协议轻**：协议简单、开销小；支持 pipeline 批量发送，降低 RTT。
- **原子性强（对你们很关键）**：比如 session / CSRF token / login state 这种“读-改-写”场景，Redis 能用原子操作降低并发 bug 概率。

### 在你们项目里用 Redis 的典型落点

- **OIDC 登录中间态与会话**：`state / nonce / code_verifier`、`bff_sid` 会话、CSRF token 需要 TTL + 快速读写 + 易清理，Redis 很适合。
- **稳定性与保护**：callback 一次性锁（NX + TTL），这类“短时锁 / 一次性标记”Redis 很擅长。
- **缓存/降级**：工具系统、multi-agent、请求缓存等场景可用 Redis 做“热点吸收层”，减轻下游压力。

---

## 持久化场景：什么是“延迟双删”？为什么要这么做？

### 问题背景（竞态）

- **线程 A**：更新 DB（新值）
- **线程 B**：同时读 DB（还没更新到/或读旧结果）→ 写回缓存（旧值）
- **结果**：缓存被旧值污染，短时间内一直读到旧数据

### 延迟双删（常见写法）

1. **先删缓存**（确保读请求不会立刻命中旧缓存）
2. **更新 DB**
3. **延迟一小段时间再删一次缓存**（把并发读/回写造成的“旧缓存”再清掉）

### 关键说明

- **为什么要“延迟”**：给并发读请求和 DB 写入传播留时间窗口；第二次删除专门清理“脏回写”。
- **延迟多久**：一般是几十到几百毫秒，取决于 DB 写耗时、读峰值、网络；要以监控数据调参。
- **注意点**：它是工程折中，不是强一致；强一致通常要上事务消息、写穿、版本号/逻辑时钟等更重方案。

---

## 多级缓存（L1/L2）怎么解释？适合你们哪里？

### 核心思路

越靠近请求方越快，但容量小/一致性弱；越往后越慢但更可靠。

### L1 / L2 / 回源

- **L1：进程内缓存（Memory Cache）**
  - **优点**：最快（纳秒/微秒级），无网络开销
  - **缺点**：单机有效、容量有限、进程重启丢失
  - **适合**：短期热点结果、配置、某些工具结果的短 TTL 缓存

- **L2：Redis（分布式缓存）**
  - **优点**：跨进程共享、TTL 管理方便、抗并发能力强
  - **缺点**：比内存慢（仍然很快），需要网络与运维
  - **适合**：session / CSRF / login state、跨请求复用的热点数据、需要统一失效的缓存

- **回源：DB/第三方服务**
  - **定位**：最慢，作为最终事实来源

### 推荐口径：读流程

- **先读 L1**，miss 再读 L2，miss 再回源（DB/上游），然后回填 L2（再回填 L1）。
- **防击穿/惊群**：TTL 加抖动、请求合并（singleflight 思路）、或你们现有的 Retry-After + 队列等。

### 推荐口径：写/失效流程

- **更新 DB 后**：删 L2 → 删 L1（或直接清 L1）；必要时用延迟双删避免并发旧值回写污染。
- **多级缓存里**：L1 过期通常要更短，避免“L2 已更新但 L1 还抱着旧值”。

---

## Redis 数据结构设计（你项目里的三种缓存对比）

### 设计对比表（快速扫一眼）

| 特性 | 工具缓存 | Embedding 缓存 | 多 Agent 缓存 |
|---|---|---|---|
| 数据结构 | String | String + Sorted Set | String（gzip 压缩）+ Sorted Set + 元数据 |
| 键策略 | MD5 哈希 | cacheId | conversationId + assistantMessageId |
| TTL 策略 | 固定 TTL | 固定 TTL（30 天） | 动态 TTL（根据进度） |
| 容量控制 | 无限制 | LRU（30 条/用户） | 按 TTL 自动清理 |
| 用户隔离 | 可选（user 模式） | 强制隔离 | 强制隔离 |
| 压缩 | 无 | 无 | gzip（节省 60–80%） |
| 索引 | 无 | 按用户索引 | 按用户索引 |
| 降级支持 | `:stale` 后缀 | 无 | 无 |
| 续期机制 | 无 | 无 | 滑动 TTL（访问时续期） |
| 异步写入 | 无 | 无 | 支持（Fire and Forget） |

### 核心设计思想（3 句话抓住）

1. **工具缓存：降级优先**
   - 主缓存 + 过期缓存双层设计（宁愿返回旧数据，也比完全不可用好）
   - 参考：HTTP Cache-Control `stale-while-revalidate`
2. **Embedding 缓存：查询优先**
   - Sorted Set + String 分离索引和数据；按用户隔离 + 自动 LRU
   - 参考：Redis 常用的二级索引模式
3. **多 Agent 缓存：性能优先**
   - gzip 节省内存；异步写入不阻塞 SSE；动态 TTL + 滑动续期适配断网重连

---

## 1) 工具缓存（Tool Cache）：String + `:stale` 过期副本

### 存储结构

```text
// 主缓存键
tool:cache:{toolName}:{md5Hash}

// 过期缓存键（降级用）
tool:cache:{toolName}:{md5Hash}:stale
```

### 键生成策略

- **params**：只对参数做 MD5，不区分用户
- **user**：`{ userId, params }` 做 MD5，区分用户
- **custom**：自定义 key 生成函数

### 数据结构（String/JSON）

```json
{
  "success": true,
  "data": {},
  "message": "...",
  "fromCache": true
}
```

### 为什么这么设计

1. String 是 Redis 最轻量、最快的基本类型，配合 `SETEX` 原子写入
2. 主缓存 + 过期缓存两层，服务降级时可返回旧数据
3. 支持全局缓存与用户隔离两种 key 策略

---

## 2) Embedding 缓存（用户提问缓存）：String + Sorted Set

### 存储结构

```text
// 用户的缓存列表（Sorted Set，按时间排序）
embedding_cache:user:{userId}:list

// 缓存详情（String）
embedding_cache:detail:{cacheId}
```

### 数据结构（示例）

```text
// 列表：Sorted Set
ZADD embedding_cache:user:{userId}:list {timestamp} {cacheId}
```

```json
{
  "cacheId": "xxx",
  "userId": "xxx",
  "requestText": "用户问题",
  "requestEmbedding": [0.1, 0.2],
  "response": "AI回复",
  "modelType": "gpt-4",
  "mode": "chat",
  "createdAt": 1234567890,
  "hitCount": 5
}
```

### 为什么这么设计

1. 分离索引和数据：ZSet 负责检索/排序，String 存放完整详情
2. 自动 LRU：每用户最多保留 30 条，超过就删最旧的

### LRU 伪代码

```ts
const listSize = await client.zcard(listKey);
if (listSize > EMBEDDING_CACHE_MAX_PER_USER) {
  const toRemove = listSize - EMBEDDING_CACHE_MAX_PER_USER;
  const oldestCacheIds = await client.zrange(listKey, 0, toRemove - 1);
  await client.del(...detailKeys);
  await client.zremrangebyrank(listKey, 0, toRemove - 1);
}
```

---

## 3) 多 Agent 缓存：String（压缩）+ Sorted Set 索引 + 元数据

### 存储结构

```text
// 主数据（String，gzip 压缩）
multi_agent:{conversationId}:{assistantMessageId}

// 元数据（String，JSON）
multi_agent:{conversationId}:{assistantMessageId}:meta

// 用户索引（Sorted Set）
multi_agent_user:{userId}
```

### 数据结构（示例）

```json
{
  "conversationId": "xxx",
  "assistantMessageId": "yyy",
  "userId": "zzz",
  "completedRounds": 2,
  "maxRounds": 5,
  "sessionState": {},
  "userQuery": "用户问题",
  "timestamp": 1234567890,
  "version": 1
}
```

```json
{
  "compressed": true,
  "rounds": 2
}
```

```text
ZADD multi_agent_user:{userId} {timestamp} "{conversationId}:{assistantMessageId}"
```

### 为什么这么设计

1. gzip 压缩：会话状态可能很大，压缩能显著节省内存
2. 动态 TTL：根据讨论进度调整过期时间
3. 异步写入：不阻塞主流程（适合 SSE）
4. 按用户索引：便于断网重连时快速找回未完成讨论