/**
 * ============================================================
 * Redis Embedding 缓存模块
 * ============================================================
 * 
 * 用途：用户请求语义相似度匹配缓存
 * 
 * 为什么使用 Redis：
 * - 这些数据完全不需要持久化（30 天自动过期）
 * - 没有数据一致性问题（只是查询缓存）
 * - 需要快速查询（内存存储，亚毫秒级响应）
 * - 每用户最多 30 条记录，规模可控
 * 
 * 实现特性：
 * - 按 userId 分组存储 embedding 向量
 * - 自动 LRU 淘汰（超过 30 条删除最旧的）
 * - 自动过期（30 天 TTL）
 * 
 * ============================================================
 */

import type { Redis } from 'ioredis';

/**
 * Embedding 缓存记录
 */
export interface EmbeddingCacheRecord {
  cacheId: string;              // 缓存 ID
  userId: string;               // 用户 ID
  requestText: string;          // 请求文本
  requestEmbedding: number[];   // 请求的 embedding 向量
  response: string;             // 缓存的响应
  modelType?: string;           // 模型类型
  mode?: string;                // 模式
  createdAt: number;            // 创建时间戳
  hitCount: number;             // 命中次数
}

// Embedding 缓存配置
const EMBEDDING_CACHE_MAX_PER_USER = 30;  // 每用户最多 30 条记录
const EMBEDDING_CACHE_TTL_DAYS = 30;      // 30 天过期

/**
 * 获取用户的 Embedding 缓存列表 Key
 */
function getEmbeddingCacheListKey(userId: string): string {
  return `embedding_cache:user:${userId}:list`;
}

/**
 * 获取 Embedding 缓存详情 Key
 */
function getEmbeddingCacheDetailKey(cacheId: string): string {
  return `embedding_cache:detail:${cacheId}`;
}

/**
 * 保存 Embedding 缓存记录
 * 
 * @param client - Redis 客户端实例
 * @param record - 缓存记录
 * @returns 是否保存成功
 */
export async function saveEmbeddingCache(
  client: Redis,
  record: EmbeddingCacheRecord
): Promise<boolean> {
  try {
    const listKey = getEmbeddingCacheListKey(record.userId);
    const detailKey = getEmbeddingCacheDetailKey(record.cacheId);
    const ttlSeconds = EMBEDDING_CACHE_TTL_DAYS * 24 * 60 * 60;
    
    console.log(` [EmbeddingCache] 保存缓存: userId=${record.userId}, cacheId=${record.cacheId}`);
    
    // 1. 保存详情数据
    await client.setex(detailKey, ttlSeconds, JSON.stringify(record));
    
    // 2. 将 cacheId 添加到用户的列表（使用 ZADD，score 为时间戳，实现按时间排序）
    await client.zadd(listKey, record.createdAt, record.cacheId);
    
    // 3. 设置列表的过期时间
    await client.expire(listKey, ttlSeconds);
    
    // 4. 检查列表长度，超过限制则删除最旧的记录
    const listSize = await client.zcard(listKey);
    if (listSize > EMBEDDING_CACHE_MAX_PER_USER) {
      const toRemove = listSize - EMBEDDING_CACHE_MAX_PER_USER;
      console.log(` [EmbeddingCache] 用户 ${record.userId} 缓存超限 (${listSize}/${EMBEDDING_CACHE_MAX_PER_USER})，删除最旧的 ${toRemove} 条`);
      
      // 获取最旧的 N 条记录
      const oldestCacheIds = await client.zrange(listKey, 0, toRemove - 1);
      
      // 删除详情数据
      if (oldestCacheIds.length > 0) {
        const detailKeys = oldestCacheIds.map(id => getEmbeddingCacheDetailKey(id));
        await client.del(...detailKeys);
        
        // 从列表中移除
        await client.zremrangebyrank(listKey, 0, toRemove - 1);
      }
    }
    
    console.log(` [EmbeddingCache] 缓存保存成功: ${detailKey} (TTL=${ttlSeconds}s)`);
    return true;
  } catch (error) {
    console.error(' [EmbeddingCache] 保存缓存失败:', error);
    return false;
  }
}

/**
 * 获取用户的所有 Embedding 缓存记录
 * 
 * @param client - Redis 客户端实例
 * @param userId - 用户 ID
 * @param modelType - 可选，筛选模型类型
 * @param mode - 可选，筛选模式
 * @returns 缓存记录列表
 */
export async function getEmbeddingCacheByUser(
  client: Redis,
  userId: string,
  modelType?: string,
  mode?: string
): Promise<EmbeddingCacheRecord[]> {
  try {
    const listKey = getEmbeddingCacheListKey(userId);
    
    // 1. 获取用户的所有 cacheId（按时间倒序，最新的在前）
    const cacheIds = await client.zrevrange(listKey, 0, -1);
    
    if (cacheIds.length === 0) {
      console.log(` [EmbeddingCache] 用户 ${userId} 没有缓存记录`);
      return [];
    }
    
    console.log(` [EmbeddingCache] 找到 ${cacheIds.length} 条缓存记录: userId=${userId}`);
    
    // 2. 批量获取详情数据
    const detailKeys = cacheIds.map(id => getEmbeddingCacheDetailKey(id));
    const records: EmbeddingCacheRecord[] = [];
    
    for (const key of detailKeys) {
      const data = await client.get(key);
      if (data) {
        try {
          const record: EmbeddingCacheRecord = JSON.parse(data);
          
          // 3. 可选筛选
          if (modelType && record.modelType !== modelType) continue;
          if (mode && record.mode !== mode) continue;
          
          records.push(record);
        } catch (error) {
          console.warn(`  [EmbeddingCache] 解析缓存失败: ${key}`, error);
        }
      }
    }
    
    console.log(` [EmbeddingCache] 返回 ${records.length} 条有效缓存`);
    return records;
  } catch (error) {
    console.error(' [EmbeddingCache] 获取缓存失败:', error);
    return [];
  }
}

/**
 * 更新缓存的命中次数
 * 
 * @param client - Redis 客户端实例
 * @param cacheId - 缓存 ID
 * @returns 是否更新成功
 */
export async function incrementEmbeddingCacheHitCount(
  client: Redis,
  cacheId: string
): Promise<boolean> {
  try {
    const detailKey = getEmbeddingCacheDetailKey(cacheId);
    
    const data = await client.get(detailKey);
    if (!data) {
      console.warn(`  [EmbeddingCache] 缓存不存在: ${cacheId}`);
      return false;
    }
    
    const record: EmbeddingCacheRecord = JSON.parse(data);
    record.hitCount++;
    
    // 更新记录，保持原有的 TTL
    const ttl = await client.ttl(detailKey);
    if (ttl > 0) {
      await client.setex(detailKey, ttl, JSON.stringify(record));
      console.log(` [EmbeddingCache] 更新命中次数: ${cacheId} → ${record.hitCount}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(' [EmbeddingCache] 更新命中次数失败:', error);
    return false;
  }
}

/**
 * 删除用户的所有 Embedding 缓存（用于测试或清理）
 * 
 * @param client - Redis 客户端实例
 * @param userId - 用户 ID
 * @returns 是否删除成功
 */
export async function clearEmbeddingCacheByUser(
  client: Redis,
  userId: string
): Promise<boolean> {
  try {
    const listKey = getEmbeddingCacheListKey(userId);
    
    // 获取所有 cacheId
    const cacheIds = await client.zrange(listKey, 0, -1);
    
    if (cacheIds.length === 0) {
      console.log(` [EmbeddingCache] 用户 ${userId} 没有缓存记录`);
      return true;
    }
    
    // 删除所有详情数据
    const detailKeys = cacheIds.map(id => getEmbeddingCacheDetailKey(id));
    await client.del(...detailKeys);
    
    // 删除列表
    await client.del(listKey);
    
    console.log(` [EmbeddingCache] 已清除用户 ${userId} 的 ${cacheIds.length} 条缓存`);
    return true;
  } catch (error) {
    console.error(' [EmbeddingCache] 清除缓存失败:', error);
    return false;
  }
}

