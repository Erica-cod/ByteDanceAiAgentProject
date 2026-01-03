/**
 * ============================================================
 * Redis 客户端核心模块
 * ============================================================
 * 
 * 职责：
 * - 提供 Redis 客户端单例
 * - 管理 Redis 连接生命周期
 * - 统一的连接配置和错误处理
 * 
 * 使用的功能模块：
 * 1. Embedding 缓存 (redis-embedding-cache.ts) - 语义相似度匹配
 * 2. 多 Agent 状态缓存 (redis-multi-agent-cache.ts) - 断网重连支持
 * 
 * ============================================================
 */

import Redis from 'ioredis';
import { printRedisMetrics } from './redis-utils.js';

// Redis 配置
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

// Redis 客户端实例（单例）
let redisClient: Redis | null = null;

/**
 * 获取 Redis 客户端实例（单例模式）
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    redisClient.on('connect', () => {
      console.log(` Redis 已连接: ${REDIS_HOST}:${REDIS_PORT}`);
    });

    redisClient.on('error', (err) => {
      console.error(' Redis 连接错误:', err);
    });

    redisClient.on('reconnecting', () => {
      console.log(' Redis 重新连接中...');
    });
  }

  return redisClient;
}

/**
 * 检查 Redis 是否可用
 */
export async function isRedisAvailable(): Promise<boolean> {
  try {
    const client = getRedisClient();
    await client.ping();
    return true;
  } catch (error) {
    console.warn(' Redis 不可用，将降级到不使用缓存:', error);
    return false;
  }
}

/**
 * 关闭 Redis 连接（优雅退出时使用）
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    // 打印最终性能报告
    printRedisMetrics();
    
    await redisClient.quit();
    redisClient = null;
    console.log(' Redis 连接已关闭');
  }
}

// ============================================================
// 导出子模块功能（便于统一从此文件导入）
// ============================================================

// Embedding 缓存功能（当前使用）
export {
  type EmbeddingCacheRecord,
  saveEmbeddingCache,
  getEmbeddingCacheByUser,
  incrementEmbeddingCacheHitCount,
  clearEmbeddingCacheByUser,
} from './redis-embedding-cache.js';

// 多 Agent 状态缓存功能（用于断网重连）
export {
  type MultiAgentState,
  saveMultiAgentState,
  loadMultiAgentState,
  deleteMultiAgentState,
  findUnfinishedDiscussions,
  clearUserMultiAgentStates,
} from './redis-multi-agent-cache.js';

// 工具函数和性能监控
export {
  type PerformanceMetrics,
  getRedisMetrics,
  resetRedisMetrics,
  printRedisMetrics,
} from './redis-utils.js';
