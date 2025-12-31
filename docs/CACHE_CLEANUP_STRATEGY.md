# 缓存清理策略详解

## 当前实现方案：MongoDB + TTL 索引

### ✅ 优势

1. **完全自动化**
   - MongoDB 后台线程自动清理过期数据
   - 无需编写定时任务或 cron job
   - 零维护成本

2. **数据持久化**
   - 即使服务重启，缓存仍然存在
   - 支持历史数据分析和统计
   - 可以手动查询和管理

3. **成本效益**
   - 不需要额外的 Redis 服务器
   - 降低运维复杂度
   - 减少内存成本（MongoDB 可以利用磁盘）

4. **灵活性**
   - 可以为不同类型的缓存设置不同的 TTL
   - 支持复杂的查询和聚合
   - 易于扩展元数据

### ⚠️ 劣势

1. **清理延迟**
   - TTL 后台线程每 60 秒运行一次
   - 过期文档可能在实际过期后 60 秒内仍存在
   - 但查询时会检查 `expiresAt`，不会返回过期数据

2. **性能开销**
   - 需要定期扫描索引
   - 大量过期文档时可能有短暂的性能影响

---

## 替代方案：Redis

### ✅ 优势

1. **精确过期**
   - 数据到期立即删除
   - 不会占用额外存储空间

2. **高性能**
   - 内存操作，速度极快
   - 适合高频读写场景

### ❌ 劣势

1. **成本高**
   - 需要额外的 Redis 服务器
   - 内存成本高于磁盘
   - 运维复杂度增加

2. **数据易失**
   - 服务重启可能丢失数据（除非配置持久化）
   - 不适合需要长期保存的缓存

3. **向量存储问题**
   - Redis 需要额外的 RedisSearch 或 RediSearch 模块才能高效存储和搜索向量
   - 配置和维护复杂度高

---

## 推荐方案：混合策略

### 方案 1：纯 MongoDB（推荐，当前实现）

适用场景：
- 中小规模应用（< 10 万用户）
- 缓存命中率 > 30%
- 对性能要求不是极致

**配置**：
```typescript
// 调整 TTL 天数
ttlDays: 30  // 默认 30 天

// 针对不同场景
ttlDays: 7   // FAQ 类问题（更新频繁）
ttlDays: 90  // 稳定知识（长期不变）
```

### 方案 2：MongoDB + Redis 双层缓存

适用场景：
- 大规模应用（> 10 万用户）
- 高并发场景（> 1000 QPS）
- 对性能要求极高

**架构**：
```
请求 
  ↓
Redis（热缓存，1小时TTL）
  ↓ miss
MongoDB（冷缓存，30天TTL）
  ↓ miss
AI 模型
```

**优势**：
- 热点数据在 Redis 中，超快响应
- 冷数据在 MongoDB 中，节省内存
- 自动分层，无需手动管理

---

## 额外清理策略

### 1. 按命中次数清理（LFU - Least Frequently Used）

定期清理命中次数低的缓存：

```typescript
/**
 * 清理低价值缓存
 * @param maxHitCount 命中次数低于此值的缓存将被清理
 */
async function cleanupLowValueCaches(maxHitCount: number = 1) {
  const collection = await getCollection();
  
  const result = await collection.deleteMany({
    hitCount: { $lte: maxHitCount },
    createdAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // 7天前创建
  });
  
  console.log(`🗑️ 清理了 ${result.deletedCount} 个低价值缓存`);
  return result.deletedCount;
}
```

### 2. 按存储空间限制清理（LRU - Least Recently Used）

保持固定数量的缓存：

```typescript
/**
 * 限制用户缓存数量
 * @param userId 用户ID
 * @param maxCaches 每个用户最多保留的缓存数
 */
async function limitUserCaches(userId: string, maxCaches: number = 100) {
  const collection = await getCollection();
  
  // 找出最老的缓存
  const caches = await collection
    .find({ userId })
    .sort({ lastHitAt: 1, createdAt: 1 }) // 按最后命中时间和创建时间升序
    .toArray();
  
  if (caches.length > maxCaches) {
    const toDelete = caches.slice(0, caches.length - maxCaches);
    const ids = toDelete.map(c => c._id);
    
    const result = await collection.deleteMany({
      _id: { $in: ids }
    });
    
    console.log(`🗑️ 为用户 ${userId} 清理了 ${result.deletedCount} 个旧缓存`);
    return result.deletedCount;
  }
  
  return 0;
}
```

### 3. 定时任务清理

使用 Node.js 定时器或 cron job：

```typescript
// 在应用启动时注册定时任务
import { CronJob } from 'cron';

// 每天凌晨 3 点清理
const cleanupJob = new CronJob('0 3 * * *', async () => {
  console.log('🧹 开始定时清理缓存...');
  
  // 1. 清理过期缓存（虽然TTL会自动清理，但手动清理更及时）
  const expired = await requestCacheService.cleanupExpired();
  console.log(`   清理过期缓存: ${expired} 个`);
  
  // 2. 清理低价值缓存
  const lowValue = await cleanupLowValueCaches(1);
  console.log(`   清理低价值缓存: ${lowValue} 个`);
  
  // 3. 统计信息
  const stats = await getCacheStats();
  console.log(`   剩余缓存: ${stats.totalCaches} 个`);
  console.log(`   总命中次数: ${stats.totalHits} 次`);
  
  console.log('✅ 定时清理完成');
});

cleanupJob.start();
```

---

## 监控和报警

### 关键指标

```typescript
interface CacheMetrics {
  totalSize: number;        // 总缓存数
  totalSizeMB: number;      // 总占用空间（MB）
  hitRate: number;          // 命中率
  avgHitCount: number;      // 平均命中次数
  oldestCache: Date;        // 最老的缓存
  expiringIn24h: number;    // 24小时内过期的数量
}
```

### 报警规则

```typescript
async function checkCacheHealth() {
  const metrics = await getCacheMetrics();
  
  // 1. 缓存数量过多
  if (metrics.totalSize > 100000) {
    console.warn('⚠️ 缓存数量过多:', metrics.totalSize);
    // 触发清理或报警
  }
  
  // 2. 占用空间过大
  if (metrics.totalSizeMB > 1000) {
    console.warn('⚠️ 缓存占用空间过大:', metrics.totalSizeMB, 'MB');
  }
  
  // 3. 命中率过低
  if (metrics.hitRate < 0.2) {
    console.warn('⚠️ 缓存命中率过低:', metrics.hitRate);
    // 考虑调整相似度阈值
  }
  
  // 4. 平均命中次数过低
  if (metrics.avgHitCount < 1.5) {
    console.warn('⚠️ 缓存利用率低:', metrics.avgHitCount);
  }
}
```

---

## 实施建议

### 阶段 1：使用当前方案（MongoDB TTL）

**适用于**：
- 项目初期
- 用户量 < 10 万
- 每日请求 < 100 万

**配置**：
```env
# 默认配置即可
CACHE_TTL_DAYS=30
```

**监控**：
- 每周检查一次缓存统计
- 关注数据库存储空间
- 观察命中率趋势

### 阶段 2：优化清理策略

**当出现以下情况时**：
- 缓存数量 > 10 万
- 数据库空间占用 > 5GB
- 命中率 < 20%

**行动**：
1. 启用定时清理任务
2. 实施 LFU 清理（清理低价值缓存）
3. 为不同类型内容设置不同 TTL

### 阶段 3：引入 Redis（可选）

**当出现以下情况时**：
- 用户量 > 50 万
- 并发请求 > 1000 QPS
- 对延迟要求 < 100ms

**架构**：
- Redis：热缓存（最近 1 小时访问的）
- MongoDB：冷缓存（所有历史缓存）
- 自动分层，无缝切换

---

## 成本估算

### MongoDB 存储成本

假设：
- 每个缓存 10 KB（含 768 维向量）
- 100 万个缓存
- 30 天 TTL

```
存储空间 = 100万 × 10 KB = 10 GB
月度成本 ≈ $2-5（云数据库）
```

### Redis 内存成本

假设：
- 同样 100 万个缓存
- 全部在内存

```
内存需求 = 100万 × 10 KB = 10 GB
月度成本 ≈ $50-100（云 Redis）
```

**结论**：MongoDB 成本仅为 Redis 的 1/10-1/20

---

## 总结

### 当前方案已经很好 ✅

你的担心是对的，但我已经实现了自动清理机制：

1. ✅ **TTL 自动过期**（默认 30 天）
2. ✅ **MongoDB 自动删除过期文档**
3. ✅ **查询时检查过期时间**
4. ✅ **支持手动清理接口**

### 建议

**现阶段**：
- 保持当前 MongoDB 方案
- 监控缓存增长和命中率
- 必要时调整 TTL（减少到 7-14 天）

**未来优化**：
- 如果数据量大，添加定时清理任务
- 如果性能瓶颈，考虑 Redis 双层缓存
- 如果成本敏感，实施 LFU 清理

### 无需担心 🎉

MongoDB 的 TTL 索引会自动管理数据生命周期，不会无限增长！

