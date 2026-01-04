# 请求缓存功能使用指南

## 概述

请求缓存功能使用向量 embedding 技术，自动识别和缓存相似的 AI 请求，避免重复计算，提升响应速度并节省 API 调用成本。

## 核心特性

### 1. 智能相似度匹配 🎯
- 使用火山引擎 embedding API 将请求转换为 768 维向量
- 通过余弦相似度计算请求之间的语义相似性
- 自动识别"什么是 AI？"和"AI 是什么？"这类相似问题

### 2. 自动缓存管理 ⚡
- MongoDB 持久化存储
- TTL 索引自动清理过期缓存（默认 30 天）
- 记录缓存命中次数和最后命中时间
- 支持用户隔离，每个用户的缓存独立

### 3. 无缝集成 🔄
- 缓存命中时流式返回，模拟真实 AI 响应
- 缓存失败自动降级，不影响正常功能
- 异步保存缓存，不阻塞主流程

## 快速开始

### 1. 配置环境变量

在 `.env` 文件中添加：

```env
# 必需：火山引擎 API Key
ARK_API_KEY=your_api_key_here

# 可选：Embedding API 配置（使用默认值即可）
ARK_EMBEDDING_API_URL=https://ark.cn-beijing.volces.com/api/v3/embeddings
ARK_EMBEDDING_MODEL=doubao-embedding-text-240715
```

### 2. 启动应用

缓存功能会自动启用，无需额外配置。

```bash
npm run dev
```

### 3. 测试缓存功能

运行 Jest 集成测试（可选）：

```bash
# 需要 MongoDB 可用；如需真实 embedding 命中，还需配置 ARK_EMBEDDING_* 相关环境变量
npm run test:request-cache
```

## 工作原理

### 请求处理流程

```
用户发送请求
    ↓
[1] 检查缓存服务是否可用
    ↓
[2] 计算请求的 embedding 向量 (100-300ms)
    ↓
[3] 在数据库中查找相似的缓存
    ↓
[4] 计算余弦相似度
    ↓
[5] 相似度 ≥ 95%？
    ├─ 是 → 🎯 返回缓存响应（流式）
    │         ↓
    │      更新命中次数
    │         ↓
    │      保存到数据库
    │
    └─ 否 → 📡 调用 AI 模型
              ↓
          生成新响应
              ↓
          保存到数据库
              ↓
          💾 保存到缓存
```

### 缓存命中示例

**第一次请求**（无缓存）:
```
用户: "什么是人工智能？"
系统: [调用 AI 模型] → 生成响应 → 保存到缓存
耗时: 3-5 秒
```

**第二次请求**（缓存命中）:
```
用户: "什么是人工智能？"（完全相同）
系统: [从缓存读取] → 流式返回
耗时: 0.5-1 秒 ⚡
```

**第三次请求**（相似请求）:
```
用户: "人工智能是什么？"（语义相似）
系统: [相似度 96%] → 从缓存读取 → 流式返回
耗时: 0.5-1 秒 ⚡
```

## 使用场景

### ✅ 适合使用缓存的场景

1. **FAQ 问答**
   - 用户经常问相同或相似的问题
   - 例如："如何注册账号？"、"怎么注册账号？"

2. **知识查询**
   - 查询稳定的知识内容
   - 例如："什么是机器学习？"、"Python 是什么？"

3. **常见操作说明**
   - 重复性高的操作指导
   - 例如："如何导出数据？"、"怎么导出报表？"

### ❌ 不适合使用缓存的场景

1. **实时数据查询**
   - 需要最新数据的请求
   - 例如："今天天气怎么样？"、"股票价格是多少？"

2. **个性化内容**
   - 每次响应都应该不同的请求
   - 例如："给我讲个笑话"、"写一首诗"

3. **多 Agent 协作**
   - 响应差异大，缓存效果有限
   - 系统会自动跳过多 Agent 模式的缓存

## 配置选项

### 相似度阈值

在 `api/lambda/chat.ts` 中调整：

```typescript
const cachedResponse = await requestCacheService.findCachedResponse(
  message,
  userId,
  {
    modelType,
    mode: 'single',
    similarityThreshold: 0.95, // 👈 调整这里
  }
);
```

**推荐值**:
- `0.95` (95%) - 严格匹配，适合生产环境（默认）
- `0.90` (90%) - 宽松匹配，提高命中率
- `0.98` (98%) - 极严格，只匹配几乎完全相同的请求

### 缓存有效期

在 `api/handlers/singleAgentHandler.ts` 中调整：

```typescript
await requestCacheService.saveToCache(
  requestText,
  content,
  userId,
  {
    modelType,
    mode: 'single',
    ttlDays: 30, // 👈 调整这里（天数）
  }
);
```

**推荐值**:
- `7` 天 - 快速变化的内容
- `30` 天 - 一般内容（默认）
- `90` 天 - 稳定的知识内容

## 监控和统计

### 查看缓存统计

```typescript
import { requestCacheService } from './api/_clean/infrastructure/cache/request-cache.service.js';

const stats = await requestCacheService.getStats(userId);

console.log('缓存统计:', {
  totalCaches: stats.totalCaches,      // 总缓存数
  totalHits: stats.totalHits,          // 总命中次数
  avgHitCount: stats.avgHitCount,      // 平均命中次数
  hitRate: stats.hitRate,              // 命中率 (0-1)
});
```

### 关键指标

1. **命中率 (Hit Rate)**
   - 计算公式: `totalHits / (totalCaches + totalHits)`
   - 理想值: 30-60%
   - 如果太低: 考虑降低相似度阈值

2. **平均命中次数 (Avg Hit Count)**
   - 每个缓存被使用的平均次数
   - 理想值: 2-5 次
   - 如果太低: 说明缓存利用率不高

### 日志监控

系统会自动输出详细日志：

```
🔍 [Cache] 检查缓存...
✅ [Cache Service] Embedding 计算完成 (维度: 768)
📦 [Cache] 找到 15 个候选缓存
✨ [Cache] 找到相似缓存: 64f8a... (相似度: 96.73%)
🎯 [Cache] 缓存命中！直接返回缓存的响应
```

## 性能影响

### Embedding 计算耗时

| 操作 | 耗时 | 说明 |
|------|------|------|
| 计算 embedding | 100-300ms | 调用火山引擎 API |
| 相似度计算 | 1-5ms | 本地内存计算 |
| 数据库查询 | 10-50ms | MongoDB 查询 |
| **总计（查找）** | **150-400ms** | 如果命中，节省 3-5 秒 |

### 性能提升

假设 AI 生成耗时 3 秒，缓存命中率 40%：

```
无缓存: 100 个请求 × 3 秒 = 300 秒
有缓存: 60 个请求 × 3 秒 + 40 个请求 × 0.5 秒 = 200 秒

节省时间: 100 秒 (33%)
```

## 故障处理

### 1. Embedding API 不可用

**现象**: 日志显示 `⚠️ [Cache Service] Embedding 服务未配置`

**原因**: 
- 未配置 `ARK_API_KEY`
- API Key 无效或过期

**解决方法**:
1. 检查 `.env` 文件中的 `ARK_API_KEY`
2. 确认 API Key 有权限访问 embedding 模型
3. 系统会自动降级，不使用缓存

### 2. 缓存命中率低

**现象**: 统计显示命中率 < 10%

**可能原因**:
- 相似度阈值太高
- 用户请求差异大
- 缓存数据太少

**解决方法**:
1. 降低相似度阈值到 0.90
2. 增加缓存有效期
3. 观察一段时间后再评估

### 3. 数据库膨胀

**现象**: MongoDB 占用空间过大

**解决方法**:
1. 检查 TTL 索引是否正常工作
2. 手动清理过期缓存:
   ```typescript
   await requestCacheService.cleanupExpired();
   ```
3. 减少缓存有效期

## 最佳实践

### 1. 合理设置阈值

```typescript
// ✅ 推荐：根据场景调整
FAQ 问答: 0.90-0.95  // 允许一定的表述差异
知识查询: 0.95-0.98  // 需要较高精确度
操作指导: 0.92-0.96  // 中等精确度
```

### 2. 监控缓存效果

定期检查统计信息，调整配置：

```typescript
// 每周运行一次
const stats = await requestCacheService.getStats(userId);

if (stats.hitRate < 0.2) {
  console.log('⚠️ 命中率过低，考虑降低阈值');
} else if (stats.hitRate > 0.6) {
  console.log('✅ 缓存效果良好');
}
```

### 3. 优雅降级

缓存失败不应影响用户体验：

```typescript
try {
  const cached = await requestCacheService.findCachedResponse(...);
  if (cached) {
    return cached;
  }
} catch (error) {
  console.error('缓存查找失败，继续正常处理:', error);
  // 降级到正常流程
}
```

### 4. 定期清理

虽然有 TTL 索引，但建议定期手动清理：

```typescript
// 每天凌晨运行
setInterval(async () => {
  const deleted = await requestCacheService.cleanupExpired();
  console.log(`清理了 ${deleted} 个过期缓存`);
}, 24 * 60 * 60 * 1000);
```

## 常见问题

### Q1: 缓存会返回错误的答案吗？

A: 不太可能。系统使用 95% 的相似度阈值，只有语义非常相似的请求才会命中缓存。如果担心，可以提高阈值到 0.98。

### Q2: 如何禁用缓存？

A: 有两种方法：
1. 不配置 `ARK_API_KEY`，系统会自动跳过缓存
2. 在代码中注释掉缓存检查逻辑

### Q3: 缓存会占用多少存储空间？

A: 每个缓存约 5-10 KB（包括 embedding 向量）。1000 个缓存约占用 5-10 MB。

### Q4: 可以清空某个用户的所有缓存吗？

A: 目前没有直接的 API，但可以通过 MongoDB 手动删除：

```javascript
db.request_caches.deleteMany({ userId: 'user-id' });
```

### Q5: 支持多语言吗？

A: 是的，火山引擎的 embedding 模型支持中英文。不同语言的相似请求也能正确匹配。

## 技术架构

### Clean Architecture 分层

```
┌─────────────────────────────────────────┐
│         Presentation Layer              │
│         (api/lambda/chat.ts)            │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│      Application Layer (Use Cases)      │
│  - FindSimilarCachedRequestUseCase      │
│  - SaveRequestCacheUseCase              │
│  - GetCachedResponseUseCase             │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│       Infrastructure Layer              │
│  - RequestCacheService (高级封装)       │
│  - MongoRequestCacheRepository          │
│  - VolcengineEmbeddingService           │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│         External Services               │
│  - MongoDB (持久化)                     │
│  - 火山引擎 Embedding API               │
└─────────────────────────────────────────┘
```

### 数据流

```
Request → Embedding → Vector Search → Similarity Check
                                            ↓
                                    Hit? → Cache
                                            ↓
                                    Miss? → AI Model → Save Cache
```

## 参考资料

- [火山引擎 Embedding API 文档](https://www.volcengine.com/docs/82379/1263512)
- [MongoDB TTL 索引](https://www.mongodb.com/docs/manual/core/index-ttl/)
- [余弦相似度算法](https://en.wikipedia.org/wiki/Cosine_similarity)
- [Clean Architecture 设计模式](../CLEAN_ARCHITECTURE_COMPLETE.md)

## 更新日志

### v1.0.0 (2025-01-01)
- ✅ 初始版本发布
- ✅ 支持基于 embedding 的相似度匹配
- ✅ MongoDB 持久化存储
- ✅ TTL 自动过期
- ✅ 用户隔离
- ✅ 统计信息
- ✅ 优雅降级

## 联系支持

如有问题或建议，请查看项目文档或联系开发团队。

