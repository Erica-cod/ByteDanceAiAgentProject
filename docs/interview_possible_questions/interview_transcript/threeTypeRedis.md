### redis数据结构设计原则对比

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

---

### 核心设计思想

1. **工具缓存：降级优先**
   - 主缓存 + 过期缓存双层设计
   - 宁愿返回旧数据，也比完全不可用好
   - 参考：HTTP Cache-Control `stale-while-revalidate`
2. **Embedding 缓存：查询优先**
   - Sorted Set + String 分离索引和数据
   - 按用户隔离，自动 LRU，避免内存膨胀
   - 参考：Redis 常用的二级索引模式
3. **多 Agent 缓存：性能优先**
   - gzip 压缩节省内存（会话状态可能几十 KB）
   - 异步写入不阻塞主流程（SSE 流式）
   - 动态 TTL + 滑动续期，适配断网重连

---

### 1) 工具缓存（Tool Cache）- String 存储 + `:stale` 过期副本

**存储结构：**

```text
// 主缓存键
tool:cache:{toolName}:{md5Hash}

// 过期缓存键（降级用）
tool:cache:{toolName}:{md5Hash}:stale
```

**键生成策略：**
- params：只对参数做 MD5，不区分用户
- user：`{ userId, params }` 做 MD5，区分用户
- custom：自定义 key 生成函数

**数据结构（String/JSON）：**

```json
{
  "success": true,
  "data": {},
  "message": "...",
  "fromCache": true
}
```

**为什么这么设计：**
1. String 是 Redis 最轻量、最快的基本类型，配合 `SETEX` 原子写入
2. 主缓存 + 过期缓存两层，服务降级时可返回旧数据
3. 支持全局缓存与用户隔离两种 key 策略

---

### 2) Embedding 缓存（用户提问缓存）- String + Sorted Set

**存储结构：**

```text
// 用户的缓存列表（Sorted Set，按时间排序）
embedding_cache:user:{userId}:list

// 缓存详情（String）
embedding_cache:detail:{cacheId}
```

**数据结构：**

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

**为什么这么设计：**
1. 分离索引和数据：ZSet 负责检索/排序，String 存放完整详情
2. 自动 LRU：每用户最多保留 30 条，超过就删最旧的

LRU 伪代码：

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

### 3) 多 Agent 缓存 - String（压缩）+ Sorted Set 索引 + 元数据

**存储结构：**

```text
// 主数据（String，gzip 压缩）
multi_agent:{conversationId}:{assistantMessageId}

// 元数据（String，JSON）
multi_agent:{conversationId}:{assistantMessageId}:meta

// 用户索引（Sorted Set）
multi_agent_user:{userId}
```

**数据结构：**

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

**为什么这么设计：**
1. gzip 压缩：会话状态可能很大，压缩能显著节省内存
2. 动态 TTL：根据讨论进度调整过期时间
3. 异步写入：不阻塞主流程（适合 SSE）
4. 按用户索引：便于断网重连时快速找回未完成讨论