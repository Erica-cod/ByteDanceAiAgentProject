# 工具降级机制和 Redis 缓存

## 🎯 新功能概述

本次更新为工具系统添加了两个企业级特性：

1. **降级机制（Fallback Chain）** - 参考 Netflix Hystrix
2. **Redis 持久化缓存** - 替代内存缓存，支持分布式部署

---

## 📋 功能清单

### ✅ 已实现

- [x] 扩展 `types.ts` 添加降级配置接口
- [x] 实现 Redis 工具缓存管理器 (`redis-tool-cache.ts`)
- [x] 增强 `tool-executor.ts` 实现降级链
- [x] 更新 `cache-manager.ts` 支持 Redis（自动降级到内存缓存）
- [x] 更新 `search-web.plugin.ts` 添加降级策略示例
- [x] 创建 Jest 集成测试（`test/jest/tool-fallback-redis.int.test.ts`）

---

## 🚀 降级机制（Fallback Chain）

### 设计理念

参考 **Netflix Hystrix** 的降级链模式，当主服务不可用时，按优先级尝试多种降级策略：

```
主服务失败
   ↓
策略 1: cache（正常缓存）
   ↓ 失败
策略 2: stale-cache（过期缓存）
   ↓ 失败
策略 3: fallback-tool（备用服务）
   ↓ 失败
策略 4: simplified（简化调用）
   ↓ 失败
策略 5: default（默认响应/兜底）
```

### 支持的降级策略

| 策略类型 | 说明 | 适用场景 |
|---------|------|---------|
| **cache** | 返回正常缓存 | 缓存未过期 |
| **stale-cache** | 返回过期缓存 | 即使过期也比没有好 |
| **fallback-tool** | 切换到备用工具 | 有备用服务 |
| **simplified** | 简化参数重试 | 降低资源消耗 |
| **default** | 返回默认响应 | 兜底方案 |

### 配置示例

```typescript
// search-web.plugin.ts
fallback: {
  enabled: true,
  fallbackChain: [
    { type: 'cache' },           // 1. 先尝试缓存
    { type: 'stale-cache' },     // 2. 过期缓存
    { type: 'simplified' },      // 3. 简化调用
    { type: 'default' },         // 4. 默认响应
  ],
  
  // 简化参数
  simplifiedParams: {
    max_results: 3,
    search_depth: 'basic',
  },
  
  // 默认响应
  defaultResponse: {
    success: true,
    data: { message: '服务暂时不可用' },
  },
  
  // 降级超时
  fallbackTimeout: 3000,
  
  // 允许过期缓存
  allowStaleCache: true,
}
```

### 触发条件

降级机制在以下情况自动触发：

1. **熔断器打开** - 工具连续失败达到阈值
2. **主服务超时** - 执行时间超过限制
3. **限流拒绝** - 请求频率超过限制（可选）

---

## 💾 Redis 持久化缓存

### 架构设计

```
CacheManager (统一接口)
   ├─ Redis 缓存（优先）
   │   ├─ 主缓存 (TTL)
   │   └─ 过期缓存 (TTL * 2，用于降级)
   │
   └─ 内存缓存（降级）
       └─ Map (兜底)
```

### 核心特性

1. **自动降级** - Redis 不可用时自动切换到内存缓存
2. **双层 TTL** - 主缓存 + 过期缓存（用于降级）
3. **透明切换** - 对上层业务无感知
4. **分布式支持** - 多实例共享缓存

### 缓存键设计

```
tool:cache:{toolName}:{md5(params)}        # 主缓存
tool:cache:{toolName}:{md5(params)}:stale  # 过期缓存
```

### Redis 配置

```bash
# .env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password  # 可选
```

---

## 📊 工作流程

### 正常执行流程

```
1. 检查 Redis 缓存
   ├─ 命中 → 返回结果 ✅
   └─ 未命中 ↓

2. 检查熔断器
   ├─ 正常 ↓
   └─ 熔断 → 触发降级链 🔄

3. 限流检查
   ├─ 通过 ↓
   └─ 拒绝 → 返回错误 ❌

4. 执行工具
   ├─ 成功 → 缓存到 Redis → 返回结果 ✅
   └─ 失败 → 触发降级链 🔄
```

### 降级执行流程

```
1. 尝试 cache 策略
   ├─ 有缓存 → 返回 ✅
   └─ 无缓存 ↓

2. 尝试 stale-cache 策略
   ├─ 有过期缓存 → 返回（标记 degraded） ⚠️
   └─ 无过期缓存 ↓

3. 尝试 simplified 策略
   ├─ 简化调用成功 → 返回（标记 degraded） ⚠️
   └─ 失败 ↓

4. 尝试 default 策略
   └─ 返回默认响应（标记 degraded） ⚠️
```

---

## 🧪 测试

### 运行测试

```bash
# 确保 Redis 已启动（推荐：docker-compose）
docker-compose up -d redis

# 运行（会自动打开 RUN_TOOL_FALLBACK_REDIS_TEST=1 + 允许测试环境用 Redis）
npm run test:fallback
```

### 测试覆盖

- ✅ Redis 连接检查
- ✅ 正常执行 + Redis 缓存
- ✅ 缓存命中验证
- ✅ 熔断触发
- ✅ 降级链执行
- ✅ 工具指标统计

---

## 📈 性能优化

### Redis vs 内存缓存

| 维度 | Redis | 内存缓存 |
|-----|-------|---------|
| **速度** | ~1ms | ~0.01ms |
| **持久化** | ✅ 是 | ❌ 否 |
| **分布式** | ✅ 支持 | ❌ 不支持 |
| **容量** | 大（GB 级） | 小（MB 级） |
| **重启保留** | ✅ 是 | ❌ 否 |

### 缓存策略建议

- **高频工具** - 启用 Redis 缓存，TTL 5-10 分钟
- **实时数据** - 短 TTL（1-2 分钟）或禁用缓存
- **稳定数据** - 长 TTL（30 分钟以上）

---

## 🎯 面试要点

### 降级机制

**问：为什么需要降级机制？**

答：在分布式系统中，服务不可避免会出现故障。降级机制确保在主服务不可用时，系统仍能提供基本功能，防止雪崩效应。我们参考了 Netflix Hystrix 的设计，实现了多级降级链。

**问：降级链的优先级如何设计？**

答：按数据新鲜度和资源消耗排序：
1. 正常缓存（最优）
2. 过期缓存（次优）
3. 简化调用（降低资源）
4. 默认响应（兜底）

### Redis 缓存

**问：为什么选择 Redis？**

答：
1. **持久化** - 重启不丢失
2. **分布式** - 多实例共享
3. **高性能** - 亚毫秒级延迟
4. **成熟稳定** - 业界标准

**问：Redis 不可用怎么办？**

答：我们实现了自动降级机制，Redis 不可用时自动切换到内存缓存，确保系统可用性。

---

## 🔧 后续优化

### 短期

- [ ] 添加更多降级策略（如多备用服务）
- [ ] 支持降级策略的动态配置
- [ ] 完善降级指标监控

### 长期

- [ ] 实现智能降级（基于历史数据）
- [ ] 支持降级策略的 A/B 测试
- [ ] 集成 APM 监控（如 Prometheus）

---

## 📚 参考资料

- [Netflix Hystrix](https://github.com/Netflix/Hystrix/wiki)
- [Resilience4j](https://resilience4j.readme.io/)
- [Redis 官方文档](https://redis.io/documentation)
- [微服务降级最佳实践](https://martinfowler.com/bliki/CircuitBreaker.html)

---

## 🎉 总结

本次更新为工具系统带来了企业级的可靠性保障：

1. **降级机制** - 参考业界最佳实践，实现优雅降级
2. **Redis 缓存** - 支持分布式部署，提升性能
3. **自动降级** - Redis 不可用时自动切换，无缝体验

系统现在具备了更强的容错能力和扩展性！🚀

