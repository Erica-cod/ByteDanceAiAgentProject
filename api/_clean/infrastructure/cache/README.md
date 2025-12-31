# 请求缓存模块

## 概述

请求缓存模块使用向量 embedding 技术，自动检测和缓存相似的 AI 请求，避免重复计算，提升响应速度并节省 API 调用成本。

## 功能特性

### 1. 智能相似度匹配
- 使用火山引擎 embedding API 将请求转换为 768 维向量
- 通过余弦相似度计算请求之间的语义相似性
- 可配置相似度阈值（默认 95%）

### 2. 自动缓存管理
- MongoDB 持久化存储
- TTL 索引自动清理过期缓存（默认 30 天）
- 记录缓存命中次数和最后命中时间

### 3. 用户隔离
- 每个用户的缓存独立存储
- 支持按模型类型和请求模式筛选

### 4. 性能优化
- 流式返回缓存内容，模拟真实 AI 响应
- 异步保存缓存，不阻塞主流程
- 缓存失败不影响正常功能

## 架构设计

```
api/_clean/
├── domain/entities/
│   └── request-cache.entity.ts          # 缓存实体定义
├── application/
│   ├── interfaces/repositories/
│   │   └── request-cache.repository.interface.ts  # 仓库接口
│   └── use-cases/request-cache/
│       ├── find-similar-cached-request.use-case.ts  # 查找相似缓存
│       ├── save-request-cache.use-case.ts           # 保存缓存
│       ├── get-cached-response.use-case.ts          # 获取缓存响应
│       ├── cleanup-expired-caches.use-case.ts       # 清理过期缓存
│       └── get-cache-stats.use-case.ts              # 获取统计信息
└── infrastructure/
    ├── repositories/
    │   └── request-cache.repository.ts   # MongoDB 实现
    └── cache/
        └── request-cache.service.ts      # 缓存服务（高级封装）
```

## 使用方法

### 1. 配置环境变量

```env
# 必需：火山引擎 API Key
ARK_API_KEY=your_api_key_here

# 可选：Embedding API 配置
ARK_EMBEDDING_API_URL=https://ark.cn-beijing.volces.com/api/v3/embeddings
ARK_EMBEDDING_MODEL=doubao-embedding-text-240715
```

### 2. 初始化索引

在应用启动时调用：

```typescript
import { getContainer } from './di-container.js';

const container = getContainer();
await container.ensureRequestCacheIndexes();
```

### 3. 使用缓存服务

```typescript
import { requestCacheService } from './infrastructure/cache/request-cache.service.js';

// 查找缓存
const cachedResponse = await requestCacheService.findCachedResponse(
  requestText,
  userId,
  {
    modelType: 'volcano',
    mode: 'single',
    similarityThreshold: 0.95, // 95% 相似度阈值
  }
);

if (cachedResponse) {
  // 使用缓存的响应
  console.log('缓存命中!', cachedResponse.content);
} else {
  // 调用 AI 模型生成新响应
  const response = await generateAIResponse(requestText);
  
  // 保存到缓存
  await requestCacheService.saveToCache(
    requestText,
    response,
    userId,
    {
      modelType: 'volcano',
      mode: 'single',
      ttlDays: 30,
    }
  );
}
```

### 4. 获取统计信息

```typescript
const stats = await requestCacheService.getStats(userId);
console.log('缓存统计:', {
  totalCaches: stats.totalCaches,
  totalHits: stats.totalHits,
  hitRate: `${(stats.hitRate * 100).toFixed(2)}%`,
});
```

## 工作流程

### 请求处理流程

```
用户请求
    ↓
检查缓存服务是否可用
    ↓
计算请求的 embedding 向量
    ↓
查询数据库中相似的缓存
    ↓
计算余弦相似度
    ↓
相似度 ≥ 阈值？
    ├─ 是 → 返回缓存响应（流式）
    └─ 否 → 调用 AI 模型
              ↓
          生成新响应
              ↓
          保存到数据库
              ↓
          保存到缓存
```

### 缓存保存流程

```
AI 响应完成
    ↓
提取响应内容和思考过程
    ↓
计算请求的 embedding 向量
    ↓
创建缓存实体
    ↓
保存到 MongoDB
    ↓
设置 TTL 索引（自动过期）
```

## 数据结构

### 缓存实体

```typescript
interface RequestCacheEntity {
  cacheId: string;              // 缓存ID
  userId: string;               // 用户ID
  requestText: string;          // 请求文本
  requestEmbedding: number[];   // 请求向量（768维）
  responseContent: string;      // 响应内容
  responseThinking?: string;    // 思考过程
  modelType: 'local' | 'volcano';
  mode?: 'single' | 'multi_agent' | 'chunking';
  hitCount: number;             // 命中次数
  lastHitAt?: Date;             // 最后命中时间
  createdAt: Date;              // 创建时间
  expiresAt: Date;              // 过期时间
  metadata?: any;               // 元数据
}
```

### MongoDB 索引

1. **TTL 索引**: `{ expiresAt: 1 }` - 自动删除过期文档
2. **用户查询索引**: `{ userId: 1, expiresAt: -1 }` - 优化用户缓存查询
3. **复合索引**: `{ userId: 1, modelType: 1, mode: 1, expiresAt: -1 }` - 优化筛选查询

## 性能考虑

### 1. Embedding 计算
- 每次查找和保存都需要调用 embedding API
- 平均耗时：100-300ms
- 建议：只对单 Agent 模式启用缓存

### 2. 相似度计算
- 余弦相似度计算在内存中进行
- 时间复杂度：O(n * d)，其中 n 是缓存数量，d 是向量维度
- 优化：限制查询返回的缓存数量（默认 100 个）

### 3. 缓存命中率
- 取决于用户请求的重复性
- 建议监控命中率，调整相似度阈值
- 典型场景：FAQ 类问题命中率可达 60-80%

## 配置选项

### 相似度阈值

```typescript
// 严格匹配（推荐用于生产环境）
similarityThreshold: 0.95  // 95% 相似度

// 宽松匹配（可能返回不太相关的缓存）
similarityThreshold: 0.85  // 85% 相似度
```

### 缓存有效期

```typescript
// 短期缓存（适合快速变化的内容）
ttlDays: 7  // 7 天

// 长期缓存（适合稳定的知识问答）
ttlDays: 90  // 90 天
```

## 监控和维护

### 1. 监控指标

```typescript
const stats = await requestCacheService.getStats(userId);

// 关键指标
- totalCaches: 总缓存数
- totalHits: 总命中次数
- hitRate: 命中率 = totalHits / (totalCaches + totalHits)
- avgHitCount: 平均每个缓存被命中的次数
```

### 2. 定期清理

虽然 TTL 索引会自动清理过期缓存，但也可以手动触发：

```typescript
const deletedCount = await requestCacheService.cleanupExpired();
console.log(`清理了 ${deletedCount} 个过期缓存`);
```

### 3. 日志监控

关键日志：
- `🔍 [Cache] 检查缓存...` - 开始查找缓存
- `🎯 [Cache] 缓存命中!` - 成功命中缓存
- `📭 [Cache] 没有找到缓存` - 未命中，将调用 AI
- `💾 [Cache] 保存到缓存...` - 开始保存新缓存
- `✅ [Cache] 缓存保存成功` - 保存完成

## 故障处理

### 1. Embedding API 不可用

```typescript
if (!requestCacheService.isAvailable()) {
  console.log('⚠️  缓存服务不可用，跳过缓存');
  // 直接调用 AI 模型，不使用缓存
}
```

### 2. 缓存查找失败

```typescript
try {
  const cached = await requestCacheService.findCachedResponse(...);
} catch (error) {
  console.error('⚠️  缓存查找失败，继续正常处理:', error);
  // 降级到正常流程，不影响用户体验
}
```

### 3. 缓存保存失败

```typescript
try {
  await requestCacheService.saveToCache(...);
} catch (error) {
  console.error('⚠️  保存缓存失败（不影响主流程）:', error);
  // 不抛出错误，缓存失败不应该影响响应
}
```

## 测试

运行测试脚本：

```bash
node test/test-request-cache.js
```

测试内容：
1. 数据库连接
2. 索引创建
3. 缓存保存
4. 相似度匹配
5. 统计信息
6. 过期清理

## 最佳实践

1. **只对单 Agent 模式启用缓存**
   - 多 Agent 和 Chunking 模式响应差异大，缓存效果有限

2. **合理设置相似度阈值**
   - 太高：命中率低，缓存利用率不足
   - 太低：可能返回不相关的响应

3. **监控缓存命中率**
   - 定期检查统计信息
   - 根据实际情况调整阈值和 TTL

4. **优雅降级**
   - 缓存失败不影响主流程
   - 保持良好的用户体验

5. **定期清理**
   - 虽然有 TTL 索引，但建议定期手动清理
   - 避免数据库膨胀

## 未来优化方向

1. **向量数据库**
   - 使用专门的向量数据库（如 Milvus、Qdrant）
   - 提升大规模向量搜索性能

2. **缓存预热**
   - 预先计算常见问题的缓存
   - 提升冷启动性能

3. **智能阈值调整**
   - 根据历史命中率自动调整阈值
   - 机器学习优化相似度判断

4. **分布式缓存**
   - 支持多实例共享缓存
   - Redis + MongoDB 混合架构

