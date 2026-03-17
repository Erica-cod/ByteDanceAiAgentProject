/**
 * Redis 工具缓存管理器
 *
 * 功能：
 * - 基于 Redis 的工具结果缓存
 * - 支持 TTL 过期
 * - 支持过期缓存获取（用于降级）
 * - 自动序列化/反序列化
 */

import type Redis from 'ioredis';
import crypto from 'crypto';
import type { ToolContext, ToolResult, CacheConfig } from '../types.js';

/**
 * 生成缓存键
 */
function generateCacheKey(
  toolName: string,
  params: any,
  context: ToolContext,
  config: CacheConfig
): string {
  let keyData: any;

  switch (config.keyStrategy) {
    case 'user':
      // 按用户缓存（同一用户同样的参数返回缓存）
      keyData = { userId: context.userId, params };
      break;

    case 'custom':
      // 自定义策略
      if (config.keyGenerator) {
        // 约定：Redis key 必须包含 toolName，避免不同工具的 key 冲突
        return `tool:cache:${toolName}:${config.keyGenerator(params, context, toolName)}`;
      }
      // 降级到默认策略
      keyData = params;
      break;

    case 'params':
    default:
      // 只按参数缓存（不区分用户）
      keyData = params;
      break;
  }

  const dataStr = JSON.stringify(keyData);
  const hash = crypto.createHash('md5').update(dataStr).digest('hex');
  return `tool:cache:${toolName}:${hash}`;
}

/**
 * 从 Redis 获取缓存
 */
export async function getToolCache(
  redis: Redis,
  toolName: string,
  params: any,
  context: ToolContext,
  config: CacheConfig
): Promise<ToolResult | null> {
  if (!config.enabled) {
    return null;
  }

  try {
    const key = generateCacheKey(toolName, params, context, config);
    const cached = await redis.get(key);

    if (!cached) {
      return null;
    }

    const result: ToolResult = JSON.parse(cached);
    console.log(`✅ [Redis Cache] 缓存命中: ${toolName}`);

    return {
      ...result,
      fromCache: true,
    };
  } catch (error: any) {
    console.error(`❌ [Redis Cache] 获取缓存失败:`, error);
    return null;
  }
}

/**
 * 获取过期缓存（用于降级）
 * 即使 TTL 已过期，也尝试返回
 */
export async function getStaleToolCache(
  redis: Redis,
  toolName: string,
  params: any,
  context: ToolContext,
  config: CacheConfig
): Promise<ToolResult | null> {
  try {
    const key = generateCacheKey(toolName, params, context, config);
    const staleKey = `${key}:stale`;

    // 先尝试正常缓存
    const cached = await redis.get(key);
    if (cached) {
      const result: ToolResult = JSON.parse(cached);
      console.log(`✅ [Redis Cache] 过期缓存命中（仍有效）: ${toolName}`);
      return {
        ...result,
        fromCache: true,
        degraded: true,
      };
    }

    // 尝试过期缓存
    const staleCached = await redis.get(staleKey);
    if (staleCached) {
      const result: ToolResult = JSON.parse(staleCached);
      console.log(`⚠️  [Redis Cache] 过期缓存命中（已过期）: ${toolName}`);
      return {
        ...result,
        fromCache: true,
        degraded: true,
        message: (result.message || '') + ' (数据可能已过期)',
      };
    }

    return null;
  } catch (error: any) {
    console.error(`❌ [Redis Cache] 获取过期缓存失败:`, error);
    return null;
  }
}

/**
 * 设置缓存到 Redis
 */
export async function setToolCache(
  redis: Redis,
  toolName: string,
  params: any,
  context: ToolContext,
  config: CacheConfig,
  result: ToolResult
): Promise<boolean> {
  if (!config.enabled) {
    return false;
  }

  try {
    const key = generateCacheKey(toolName, params, context, config);
    const staleKey = `${key}:stale`;
    const value = JSON.stringify(result);

    // 设置主缓存（带 TTL）
    await redis.setex(key, config.ttl, value);

    // 设置过期缓存（TTL 的 2 倍，用于降级）
    await redis.setex(staleKey, config.ttl * 2, value);

    console.log(`💾 [Redis Cache] 缓存已设置: ${toolName}，TTL ${config.ttl}秒`);
    return true;
  } catch (error: any) {
    console.error(`❌ [Redis Cache] 设置缓存失败:`, error);
    return false;
  }
}

/**
 * 清除指定工具的所有缓存
 */
export async function clearToolCache(redis: Redis, toolName: string): Promise<number> {
  try {
    const pattern = `tool:cache:${toolName}:*`;
    const keys = await redis.keys(pattern);

    if (keys.length === 0) {
      return 0;
    }

    await redis.del(...keys);
    console.log(`🧹 [Redis Cache] 清除了 ${keys.length} 个 "${toolName}" 的缓存`);
    return keys.length;
  } catch (error: any) {
    console.error(`❌ [Redis Cache] 清除缓存失败:`, error);
    return 0;
  }
}

/**
 * 清除所有工具缓存
 */
export async function clearAllToolCache(redis: Redis): Promise<number> {
  try {
    const pattern = 'tool:cache:*';
    const keys = await redis.keys(pattern);

    if (keys.length === 0) {
      return 0;
    }

    await redis.del(...keys);
    console.log(`🧹 [Redis Cache] 清除了所有工具缓存，共 ${keys.length} 个`);
    return keys.length;
  } catch (error: any) {
    console.error(`❌ [Redis Cache] 清除所有缓存失败:`, error);
    return 0;
  }
}

/**
 * 获取缓存统计信息
 */
export async function getToolCacheStats(
  redis: Redis,
  toolName?: string
): Promise<{
  totalKeys: number;
  estimatedSize: number;
}> {
  try {
    const pattern = toolName ? `tool:cache:${toolName}:*` : 'tool:cache:*';
    const keys = await redis.keys(pattern);

    let estimatedSize = 0;
    for (const key of keys.slice(0, 100)) {
      // 只采样前 100 个
      const size = await redis.strlen(key);
      estimatedSize += size;
    }

    // 估算总大小
    if (keys.length > 100) {
      estimatedSize = Math.round((estimatedSize / 100) * keys.length);
    }

    return {
      totalKeys: keys.length,
      estimatedSize,
    };
  } catch (error: any) {
    console.error(`❌ [Redis Cache] 获取统计信息失败:`, error);
    return {
      totalKeys: 0,
      estimatedSize: 0,
    };
  }
}


