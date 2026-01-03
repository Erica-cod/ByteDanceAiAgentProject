# Redis 缓存模块说明

## 📁 模块结构

为了提高代码可维护性，Redis 相关功能已按职责拆分为多个模块：

```
api/_clean/infrastructure/cache/
├── redis-client.ts                  # 核心客户端模块（统一入口）
├── redis-utils.ts                   # 工具函数（压缩/解压/性能监控）
├── redis-embedding-cache.ts         # Embedding 缓存功能（✅ 语义相似度匹配）
├── redis-multi-agent-cache.ts       # 多 Agent 状态缓存（✅ 断网重连支持）
└── request-cache.service.ts         # 请求缓存服务（业务层）
```

---

## 📦 各模块职责

### 1. **redis-client.ts** - 核心客户端模块

**职责：**
- 提供 Redis 客户端单例 (`getRedisClient()`)
- 管理连接生命周期
- 统一的配置和错误处理
- **统一导出其他子模块的功能**（作为统一入口）

**主要函数：**
```typescript
getRedisClient(): Redis                    // 获取 Redis 客户端单例
isRedisAvailable(): Promise<boolean>       // 检查 Redis 是否可用
closeRedisClient(): Promise<void>          // 关闭连接
```

**使用示例：**
```typescript
import { getRedisClient } from './redis-client';

const client = getRedisClient();
await client.set('key', 'value');
```

---

### 2. **redis-utils.ts** - 工具函数模块

**职责：**
- gzip 压缩/解压
- 性能监控和统计
- 通用辅助函数

**主要函数：**
```typescript
compressData(data: string): Promise<Buffer>       // 压缩数据
decompressData(buffer: Buffer): Promise<string>   // 解压数据
recordWrite(elapsedTime: number): void            // 记录写入性能
recordRead(elapsedTime: number): void             // 记录读取性能
recordError(): void                               // 记录错误
getRedisMetrics(): PerformanceMetrics             // 获取性能统计
resetRedisMetrics(): void                         // 重置统计
printRedisMetrics(): void                         // 打印报告
```

**使用示例：**
```typescript
import { compressData, getRedisMetrics } from './redis-utils';

const compressed = await compressData(largeString);
const stats = getRedisMetrics();
console.log(`平均读取耗时: ${stats.avgReadTime}ms`);
```

---

### 3. **redis-embedding-cache.ts** - Embedding 缓存模块（✅ 当前使用）

**职责：**
- 用户请求语义相似度匹配缓存
- 按 userId 分组存储 embedding 向量
- 自动 LRU 淘汰（每用户最多 30 条）
- 自动过期（30 天 TTL）

**为什么使用 Redis：**
- ✅ 数据完全不需要持久化（30 天自动过期）
- ✅ 没有数据一致性问题（只是查询缓存）
- ✅ 需要快速查询（内存存储，亚毫秒级响应）
- ✅ 每用户最多 30 条记录，规模可控

**主要函数：**
```typescript
saveEmbeddingCache(client: Redis, record: EmbeddingCacheRecord): Promise<boolean>
getEmbeddingCacheByUser(client: Redis, userId: string, modelType?: string, mode?: string): Promise<EmbeddingCacheRecord[]>
incrementEmbeddingCacheHitCount(client: Redis, cacheId: string): Promise<boolean>
clearEmbeddingCacheByUser(client: Redis, userId: string): Promise<boolean>
```

**使用示例：**
```typescript
import { getRedisClient } from './redis-client';
import { saveEmbeddingCache, getEmbeddingCacheByUser } from './redis-embedding-cache';

const client = getRedisClient();

// 保存缓存
await saveEmbeddingCache(client, {
  cacheId: 'uuid-xxx',
  userId: 'user-123',
  requestText: '今天天气怎么样',
  requestEmbedding: [0.1, 0.2, ...],
  response: '今天天气晴朗...',
  createdAt: Date.now(),
  hitCount: 0,
});

// 查询缓存
const records = await getEmbeddingCacheByUser(client, 'user-123');
```

---

### 4. **redis-multi-agent-cache.ts** - 多 Agent 状态缓存模块（✅ 断网重连支持）

**职责：**
- 多 Agent 讨论回合状态缓存（防止断网重连）
- 按用户维度索引（快速查找未完成讨论）
- gzip 压缩存储（节省 60-80% 内存）
- 动态 TTL（根据会话进度调整）

**为什么使用 Redis：**
- ✅ 这是过程性数据，不需要永久持久化
- ✅ 用于断网重连场景，需要快速查询（亚毫秒级）
- ✅ 自动过期清理（TTL），避免内存占用
- ✅ 支持按用户 ID 查找未完成的讨论

**典型使用场景：**
1. 用户在多 Agent 讨论过程中网络断开
2. 重连后系统自动查找该用户的未完成讨论
3. 恢复讨论状态，继续进行

**主要函数：**
```typescript
// 保存状态（支持异步写入）
saveMultiAgentState(
  client: Redis,
  conversationId: string,
  assistantMessageId: string,
  userId: string,
  state: { completedRounds: number; sessionState: any; userQuery: string },
  options?: { maxRounds?: number; async?: boolean }
): Promise<boolean>

// 恢复状态
loadMultiAgentState(
  client: Redis,
  conversationId: string,
  assistantMessageId: string,
  options?: { renewTTL?: boolean; maxRounds?: number }
): Promise<MultiAgentState | null>

// 删除状态（完成或取消时）
deleteMultiAgentState(
  client: Redis,
  conversationId: string,
  assistantMessageId: string,
  userId?: string
): Promise<boolean>

// ✨ 查找用户未完成的讨论（断网重连核心功能）
findUnfinishedDiscussions(
  client: Redis,
  userId: string
): Promise<Array<{
  conversationId: string;
  assistantMessageId: string;
  completedRounds: number;
  maxRounds?: number;
  timestamp: number;
  state: MultiAgentState | null;
}>>

// 清理用户的所有状态（测试或清理）
clearUserMultiAgentStates(
  client: Redis,
  userId: string
): Promise<boolean>
```

---

### 5. **request-cache.service.ts** - 请求缓存服务（业务层）

**职责：**
- 业务层的缓存服务
- 封装 Embedding 计算和相似度匹配逻辑
- 提供统一的缓存查询和保存接口

**主要函数：**
```typescript
findCachedResponse(userId: string, requestText: string, options?: any): Promise<CachedResponse | null>
saveToCache(userId: string, requestText: string, response: string, options?: any): Promise<boolean>
```

**使用示例：**
```typescript
import { RequestCacheService } from './request-cache.service';

const cacheService = new RequestCacheService();

// 查找缓存
const cached = await cacheService.findCachedResponse('user-123', '今天天气怎么样');
if (cached) {
  console.log('缓存命中:', cached.content);
}

// 保存缓存
await cacheService.saveToCache('user-123', '今天天气怎么样', '今天天气晴朗...');
```

---

## 🔄 导入方式

### ✅ 推荐方式 1：从 redis-client 统一导入

```typescript
// redis-client.ts 已重新导出所有子模块功能
import {
  getRedisClient,
  saveEmbeddingCache,
  getEmbeddingCacheByUser,
  type EmbeddingCacheRecord,
  getRedisMetrics,
} from './redis-client';
```

### ✅ 推荐方式 2：从子模块直接导入

```typescript
// 直接从子模块导入（更明确）
import { getRedisClient } from './redis-client';
import { saveEmbeddingCache } from './redis-embedding-cache';
import { compressData } from './redis-utils';
```

### ❌ 不推荐：混合导入

```typescript
// 不推荐：既从 redis-client 导入，又从子模块导入
import { getRedisClient } from './redis-client';
import { saveEmbeddingCache } from './redis-embedding-cache';  // 与上面重复了
```

---

## 📊 性能监控

所有 Redis 操作都会被自动记录，可以通过以下方式查看性能统计：

```typescript
import { getRedisMetrics, printRedisMetrics } from './redis-client';

// 获取统计数据
const stats = getRedisMetrics();
console.log(`总写入: ${stats.totalWrites}`);
console.log(`平均写入耗时: ${stats.avgWriteTime}ms`);
console.log(`压缩率: ${stats.compressionRatio}%`);

// 打印完整报告
printRedisMetrics();
```

---

## 🧪 测试指南

### 测试 Embedding 缓存

```typescript
import { getRedisClient } from './redis-client';
import { saveEmbeddingCache, getEmbeddingCacheByUser, clearEmbeddingCacheByUser } from './redis-embedding-cache';

// 1. 保存测试数据
const client = getRedisClient();
await saveEmbeddingCache(client, {
  cacheId: 'test-001',
  userId: 'test-user',
  requestText: '测试请求',
  requestEmbedding: [0.1, 0.2, 0.3],
  response: '测试响应',
  createdAt: Date.now(),
  hitCount: 0,
});

// 2. 查询测试数据
const records = await getEmbeddingCacheByUser(client, 'test-user');
console.log(`找到 ${records.length} 条记录`);

// 3. 清理测试数据
await clearEmbeddingCacheByUser(client, 'test-user');
```

### 测试多 Agent 断网重连

```typescript
import { getRedisClient } from './redis-client';
import {
  saveMultiAgentState,
  loadMultiAgentState,
  findUnfinishedDiscussions,
  deleteMultiAgentState,
} from './redis-multi-agent-cache';

const client = getRedisClient();
const userId = 'user-123';
const conversationId = 'conv-456';
const assistantMessageId = 'msg-789';

// 1. 保存多 Agent 状态（模拟第1轮完成）
await saveMultiAgentState(
  client,
  conversationId,
  assistantMessageId,
  userId,
  {
    completedRounds: 1,
    sessionState: { /* ... */ },
    userQuery: '帮我分析这个问题',
  },
  {
    maxRounds: 5,
    async: false, // 同步写入，确保保存成功
  }
);

// 2. 模拟断网重连：查找用户未完成的讨论
const unfinished = await findUnfinishedDiscussions(client, userId);
console.log(`找到 ${unfinished.length} 个未完成的讨论`);

if (unfinished.length > 0) {
  const latest = unfinished[0]; // 获取最新的未完成讨论
  console.log(`恢复讨论: ${latest.conversationId}, 已完成 ${latest.completedRounds}/${latest.maxRounds} 轮`);
  
  // 3. 恢复状态
  const state = await loadMultiAgentState(
    client,
    latest.conversationId,
    latest.assistantMessageId,
    { renewTTL: true } // 续期，继续讨论
  );
  
  if (state) {
    console.log('状态已恢复，继续讨论...');
    // ... 继续多 Agent 讨论流程
  }
}

// 4. 讨论完成后删除状态
await deleteMultiAgentState(client, conversationId, assistantMessageId, userId);
```

---

## 📝 变更日志

### 2025-01-03：多 Agent 状态缓存重新启用
- **原因**：多 Agent 讨论状态是过程性数据，用于断网重连，不需要持久化
- **变更**：
  - ✅ 重新启用 `redis-multi-agent-cache.ts` 模块
  - ✅ 添加 `userId` 参数，支持按用户维度索引
  - ✅ 新增 `findUnfinishedDiscussions()` 函数，快速查找未完成讨论
  - ✅ 新增 `clearUserMultiAgentStates()` 函数，清理用户状态
  - ✅ 使用 Redis Sorted Set 实现按时间排序
  - ✅ 删除状态时自动更新用户索引

### 2025-01-03：模块化拆分
- **原因**：原 `redis-client.ts` 文件过大（647 行），难以维护
- **变更**：
  - ✅ 拆分为 4 个独立模块
  - ✅ 保持向后兼容（redis-client.ts 重新导出所有功能）
  - ✅ 无需修改现有调用代码
  - ✅ 提高代码可读性和可维护性

### 2025-01-03：Embedding 缓存迁移到 Redis
- **原因**：Embedding 缓存数据不需要持久化，适合用 Redis 存储
- **变更**：
  - ✅ 新增 `redis-embedding-cache.ts` 模块
  - ✅ 每用户最多 30 条记录，自动 LRU 淘汰
  - ✅ 30 天自动过期，减少内存占用
  - ✅ 使用 Redis Sorted Set 实现按时间排序

---

## 🔗 相关文档

- `docs/ARCHITECTURE_DECISION.md` - 架构决策记录
- `docs/11-Interview-Prep/LLM_BEHAVIOR_PREDICTION_SPEECH.md` - Embedding 缓存实现原理
- `api/_clean/infrastructure/cache/request-cache.service.ts` - 业务层缓存服务

---

## ❓ 常见问题

### Q1: 为什么不把所有功能都放在一个文件里？
**A:** 单一文件过大（647 行）会降低可维护性。拆分后每个模块职责清晰，更易于理解和修改。

### Q2: 多 Agent 状态缓存和 Embedding 缓存有什么区别？
**A:** 
- **Embedding 缓存**：长期缓存，用于避免重复计算相似请求，30 天过期
- **多 Agent 状态缓存**：短期缓存，用于断网重连恢复讨论状态，动态 TTL（3-8 分钟）

### Q3: 如何选择导入方式？
**A:** 
- 如果只需要一两个功能，建议从 `redis-client` 统一导入
- 如果需要多个功能且来自不同模块，建议从子模块直接导入（更明确）

### Q4: Redis 连接失败怎么办？
**A:** Redis 客户端内置了重试机制和降级策略。如果 Redis 不可用，系统会自动降级到不使用缓存。

### Q5: 如何处理用户断网重连？
**A:** 
1. 用户重连后，调用 `findUnfinishedDiscussions(userId)` 查找未完成的讨论
2. 如果找到，使用 `loadMultiAgentState()` 恢复状态
3. 继续多 Agent 讨论流程
4. 讨论完成后，使用 `deleteMultiAgentState()` 清理状态

---

**维护者**: AI Agent Team  
**最后更新**: 2025-01-03

