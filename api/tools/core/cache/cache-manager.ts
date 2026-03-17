/**
 * 工具缓存管理器
 *
 * 功能：
 * - 基于参数的智能缓存
 * - 支持 TTL 过期
 * - 自动清理过期缓存
 * - 支持 Redis 持久化缓存
 */

import crypto from 'crypto';
import type { CacheConfig, ToolContext } from '../types.js';
import { getRedisClient, isRedisAvailable } from '../../../_clean/infrastructure/cache/redis-client.js';
import {
  getToolCache,
  getStaleToolCache,
  setToolCache,
  clearToolCache as clearRedisToolCache,
  clearAllToolCache as clearAllRedisToolCache,
} from './redis-tool-cache.js';

interface CacheEntry {
  result: any;
  timestamp: number;
  expiresAt: number;
  hits: number;
}

export class CacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private configs: Map<string, CacheConfig> = new Map();
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
  };
  private useRedis: boolean = false;
  private cleanupTimer: NodeJS.Timeout;

  constructor() {
    // 每 5 分钟清理一次过期缓存
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    // Jest 环境不应被 interval 卡住退出
    this.cleanupTimer.unref?.();

    // 测试环境默认禁用 Redis（避免本地无 Redis/密码不一致导致日志噪音与 open handles）
    // 但允许在 integration 场景显式打开（用于验证 tool cache 是否真的写入 Redis）
    const allowRedisInTest = process.env.ALLOW_REDIS_IN_TEST === 'true';
    const isTest = (process.env.NODE_ENV === 'test' || process.env.TEST_TYPE === 'unit') && !allowRedisInTest;

    if (!isTest) {
      void this.checkRedis();
    } else {
      this.useRedis = false;
    }
  }

  /**
   * 检查 Redis 是否可用
   */
  private async checkRedis(): Promise<void> {
    this.useRedis = await isRedisAvailable();
    if (this.useRedis) {
      console.log('✅ [CacheManager] Redis 缓存已启用');
    } else {
      console.log('⚠️  [CacheManager] Redis 不可用，使用内存缓存');
    }
  }

  /**
   * 设置工具的缓存配置
   */
  setConfig(toolName: string, config: CacheConfig): void {
    this.configs.set(toolName, config);
  }

  /**
   * 生成缓存键
   */
  private generateKey(toolName: string, params: any, context: ToolContext, config: CacheConfig): string {
    let keyData: any;

    switch (config.keyStrategy) {
      case 'user':
        // 按用户缓存（同一用户同样的参数返回缓存）
        keyData = { userId: context.userId, params };
        break;

      case 'custom':
        // 自定义策略
        if (config.keyGenerator) {
          // 约定：自定义 key 仍然必须带 toolName 前缀，便于按工具清理内存缓存
          return `${toolName}:${config.keyGenerator(params, context, toolName)}`;
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
    return `${toolName}:${hash}`;
  }

  /**
   * 获取缓存
   */
  async get(toolName: string, params: any, context: ToolContext): Promise<any | null> {
    const config = this.configs.get(toolName);

    // 缓存未启用
    if (!config || !config.enabled) {
      return null;
    }

    // 优先使用 Redis
    if (this.useRedis) {
      try {
        const redis = getRedisClient();
        const result = await getToolCache(redis, toolName, params, context, config);
        if (result) {
          this.stats.hits++;
          return result;
        }
      } catch (error) {
        console.warn('⚠️  Redis 缓存获取失败，降级到内存缓存');
      }
    }

    // 降级到内存缓存
    const key = this.generateKey(toolName, params, context, config);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // 命中
    entry.hits++;
    this.stats.hits++;
    console.log(`✅ 缓存命中: ${toolName} (已使用 ${entry.hits} 次)`);

    return {
      ...entry.result,
      fromCache: true,
    };
  }

  /**
   * 获取过期缓存（用于降级）
   */
  async getStale(toolName: string, params: any, context: ToolContext): Promise<any | null> {
    const config = this.configs.get(toolName);

    if (!config || !config.enabled) {
      return null;
    }

    // 优先使用 Redis 过期缓存
    if (this.useRedis) {
      try {
        const redis = getRedisClient();
        const result = await getStaleToolCache(redis, toolName, params, context, config);
        if (result) {
          return result;
        }
      } catch (error) {
        console.warn('⚠️  Redis 过期缓存获取失败');
      }
    }

    // 内存缓存：即使过期也返回
    const key = this.generateKey(toolName, params, context, config);
    const entry = this.cache.get(key);

    if (entry) {
      console.log(`⚠️  返回过期缓存: ${toolName}`);
      return {
        ...entry.result,
        fromCache: true,
        degraded: true,
        message: (entry.result.message || '') + ' (数据可能已过期)',
      };
    }

    return null;
  }

  /**
   * 设置缓存
   */
  async set(toolName: string, params: any, context: ToolContext, result: any): Promise<void> {
    const config = this.configs.get(toolName);

    // 缓存未启用
    if (!config || !config.enabled) {
      return;
    }

    // 优先使用 Redis
    if (this.useRedis) {
      try {
        const redis = getRedisClient();
        await setToolCache(redis, toolName, params, context, config, result);
        this.stats.sets++;
        return;
      } catch (error) {
        console.warn('⚠️  Redis 缓存设置失败，降级到内存缓存');
      }
    }

    // 降级到内存缓存
    const key = this.generateKey(toolName, params, context, config);
    const now = Date.now();

    this.cache.set(key, {
      result,
      timestamp: now,
      expiresAt: now + config.ttl * 1000,
      hits: 0,
    });

    this.stats.sets++;
    console.log(`💾 缓存已设置: ${toolName}，有效期 ${config.ttl}秒`);
  }

  /**
   * 清除指定工具的所有缓存
   */
  async clear(toolName: string): Promise<number> {
    let cleared = 0;

    // 清除 Redis 缓存
    if (this.useRedis) {
      try {
        const redis = getRedisClient();
        cleared += await clearRedisToolCache(redis, toolName);
      } catch (error) {
        console.warn('⚠️  Redis 缓存清除失败');
      }
    }

    // 清除内存缓存
    for (const [key] of this.cache.entries()) {
      if (key.startsWith(`${toolName}:`)) {
        this.cache.delete(key);
        cleared++;
      }
    }

    if (cleared > 0) {
      console.log(`🧹 清除了 ${cleared} 个 "${toolName}" 的缓存`);
    }

    return cleared;
  }

  /**
   * 清除所有缓存
   */
  async clearAll(): Promise<void> {
    let total = 0;

    // 清除 Redis 缓存
    if (this.useRedis) {
      try {
        const redis = getRedisClient();
        total += await clearAllRedisToolCache(redis);
      } catch (error) {
        console.warn('⚠️  Redis 缓存清除失败');
      }
    }

    // 清除内存缓存
    const size = this.cache.size;
    this.cache.clear();
    total += size;

    console.log(`🧹 清除了所有缓存，共 ${total} 个`);
  }

  /**
   * 清理过期缓存
   */
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 清理了 ${cleaned} 个过期缓存`);
    }
  }

  /**
   * 获取缓存统计
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) : '0.0';

    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      hitRate: `${hitRate}%`,
    };
  }

  /**
   * 获取指定工具的缓存统计
   */
  getToolStats(toolName: string) {
    let count = 0;
    let totalHits = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (key.startsWith(`${toolName}:`)) {
        count++;
        totalHits += entry.hits;
      }
    }

    return {
      count,
      totalHits,
      averageHits: count > 0 ? (totalHits / count).toFixed(1) : '0.0',
    };
  }
}

// 单例实例
export const cacheManager = new CacheManager();


