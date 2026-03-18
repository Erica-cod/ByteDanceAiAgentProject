/**
 * 请求缓存服务
 * 
 * 使用 Redis 存储 embedding 缓存，实现语义相似度匹配
 * 
 * 架构变更：
 * - 直接使用 Redis（不经过 Repository 层）
 * - 每用户最多 30 条记录，LRU 自动淘汰
 * - 30 天自动过期
 * - 不持久化到 MongoDB，无数据一致性问题
 */

import { embeddingService, type IEmbeddingService } from '../llm/embedding.service.js';
import { cosineSimilarity } from '../../shared/utils/similarity-calculator.js';
import { getRedisClient } from './redis-client.js';
import {
  getEmbeddingCacheByUser,
  saveEmbeddingCache,
  incrementEmbeddingCacheHitCount,
  clearEmbeddingCacheByUser,
  type EmbeddingCacheRecord,
} from './redis-embedding-cache.js';
import { randomUUID } from 'crypto';

/**
 * 缓存命中等级：
 * - L1: 高相似度精确命中（>=0.98），直接返回
 * - L2: 中等相似度命中（>=0.88），返回缓存内容作为参考，可用本地模型改写生成变体
 * - L3: 未命中（<0.88），走正常模型调用
 */
export type CacheHitLevel = 'L1' | 'L2' | 'L3';

/**
 * 缓存的响应
 */
export interface CachedResponse {
  cacheId: string;
  content: string;
  thinking?: string;
  metadata?: any;
  similarity?: number;
  hitCount?: number;
  hitLevel: CacheHitLevel;
}

/**
 * 请求缓存服务
 */
export class RequestCacheService {
  private embeddingService: IEmbeddingService;

  constructor(embeddingServiceInstance?: IEmbeddingService) {
    // 使用共享的 embedding 服务单例
    this.embeddingService = embeddingServiceInstance || embeddingService;
  }

  /**
   * 检查缓存服务是否可用
   */
  isAvailable(): boolean {
    return this.embeddingService.isConfigured();
  }

  /**
   * 查找相似的缓存请求
   * 
   * @param requestText - 请求文本
   * @param userId - 用户ID
   * @param options - 查找选项
   * @returns 缓存的响应，如果没有找到返回 null
   */
  /**
   * 三级缓存阈值（可通过环境变量覆盖）
   */
  private getThresholds() {
    return {
      L1: parseFloat(process.env.CACHE_L1_THRESHOLD || '0.98'),
      L2: parseFloat(process.env.CACHE_L2_THRESHOLD || '0.88'),
    };
  }

  async findCachedResponse(
    requestText: string,
    userId: string,
    options?: {
      modelType?: 'local' | 'volcano';
      mode?: 'single' | 'multi_agent' | 'chunking';
      similarityThreshold?: number;
    }
  ): Promise<CachedResponse | null> {
    if (!this.isAvailable()) {
      console.log('  [Cache Service] Embedding 服务未配置，跳过缓存查找');
      return null;
    }

    try {
      console.log(` [Cache Service] 查找缓存: "${requestText.slice(0, 50)}..."`);

      const requestEmbedding = await this.embeddingService.getEmbedding(requestText);
      console.log(` [Cache Service] Embedding 计算完成 (维度: ${requestEmbedding.length})`);

      const client = getRedisClient();
      const caches = await getEmbeddingCacheByUser(
        client,
        userId,
        options?.modelType,
        options?.mode
      );

      if (caches.length === 0) {
        console.log(' [Cache Service] 用户没有缓存记录');
        return null;
      }

      console.log(` [Cache Service] 找到 ${caches.length} 条候选缓存`);

      // 找到相似度最高的缓存记录
      let bestMatch: { cache: EmbeddingCacheRecord; similarity: number } | null = null;
      const thresholds = this.getThresholds();

      // 兼容旧调用方的 similarityThreshold（如果传了就用旧逻辑的最低阈值）
      const minThreshold = options?.similarityThreshold
        ? Math.min(options.similarityThreshold, thresholds.L2)
        : thresholds.L2;

      for (const cache of caches) {
        const similarity = cosineSimilarity(requestEmbedding, cache.requestEmbedding);

        if (similarity >= minThreshold) {
          if (!bestMatch || similarity > bestMatch.similarity) {
            bestMatch = { cache, similarity };
          }
        }
      }

      if (!bestMatch) {
        console.log(' [Cache Service] 没有找到足够相似的缓存 (L3 未命中)');
        return null;
      }

      // 判定缓存命中等级
      let hitLevel: CacheHitLevel;
      const sim = bestMatch.similarity;
      const hitCount = bestMatch.cache.hitCount;

      if (sim >= thresholds.L1 && hitCount < 3) {
        // L1: 高相似度且未被反复命中（反复命中的降级到 L2 提供变体）
        hitLevel = 'L1';
      } else if (sim >= thresholds.L2) {
        hitLevel = 'L2';
      } else {
        return null; // 不应到达，但保险起见
      }

      await incrementEmbeddingCacheHitCount(client, bestMatch.cache.cacheId);

      console.log(
        ` [Cache Service] 缓存命中! ` +
        `等级: ${hitLevel}, ` +
        `相似度: ${(sim * 100).toFixed(2)}%, ` +
        `cacheId: ${bestMatch.cache.cacheId}, ` +
        `命中次数: ${hitCount + 1}`
      );

      return {
        cacheId: bestMatch.cache.cacheId,
        content: bestMatch.cache.response,
        similarity: sim,
        hitCount: hitCount + 1,
        hitLevel,
      };
    } catch (error: any) {
      console.error(' [Cache Service] 查找缓存失败:', error);
      return null;
    }
  }

  /**
   * 保存请求和响应到缓存
   * 
   * @param requestText - 请求文本
   * @param responseContent - 响应内容
   * @param userId - 用户ID
   * @param options - 保存选项
   */
  async saveToCache(
    requestText: string,
    responseContent: string,
    userId: string,
    options: {
      modelType: 'local' | 'volcano';
      mode?: 'single' | 'multi_agent' | 'chunking';
      responseThinking?: string;
      metadata?: any;
      ttlDays?: number;  // 忽略此参数，统一使用 30 天
    }
  ): Promise<void> {
    if (!this.isAvailable()) {
      console.log('  [Cache Service] Embedding 服务未配置，跳过缓存保存');
      return;
    }

    try {
      console.log(` [Cache Service] 保存到缓存: "${requestText.slice(0, 50)}..."`);

      // 1. 计算请求的 embedding
      const requestEmbedding = await this.embeddingService.getEmbedding(requestText);
      console.log(` [Cache Service] Embedding 计算完成 (维度: ${requestEmbedding.length})`);

      // 2. 保存到 Redis
      const record: EmbeddingCacheRecord = {
        cacheId: randomUUID(),
        userId,
        requestText,
        requestEmbedding,
        response: responseContent,
        modelType: options.modelType,
        mode: options.mode || 'single',
        createdAt: Date.now(),
        hitCount: 0,
      };

      const client = getRedisClient();
      const success = await saveEmbeddingCache(client, record);

      if (success) {
        console.log(' [Cache Service] 缓存保存成功');
      } else {
        console.error(' [Cache Service] 缓存保存失败');
      }
    } catch (error: any) {
      console.error(' [Cache Service] 保存缓存失败:', error);
      // 不抛出错误，缓存失败不应该影响主流程
    }
  }

  /**
   * 清理用户的所有缓存（用于测试或清理）
   * 
   * @param userId - 用户ID
   */
  async clearUserCache(userId: string): Promise<boolean> {
    try {
      console.log(`  [Cache Service] 清理用户缓存: ${userId}`);
      const client = getRedisClient();
      return await clearEmbeddingCacheByUser(client, userId);
    } catch (error: any) {
      console.error(' [Cache Service] 清理缓存失败:', error);
      return false;
    }
  }

  /**
   * 获取缓存统计信息
   * 
   * @param userId - 用户ID
   */
  async getStats(userId: string) {
    try {
      const client = getRedisClient();
      const caches = await getEmbeddingCacheByUser(client, userId);

      return {
        totalCaches: caches.length,
        totalHits: caches.reduce((sum, cache) => sum + cache.hitCount, 0),
        caches: caches.map(cache => ({
          cacheId: cache.cacheId,
          requestText: cache.requestText.slice(0, 50) + '...',
          hitCount: cache.hitCount,
          createdAt: new Date(cache.createdAt).toISOString(),
          modelType: cache.modelType,
          mode: cache.mode,
        })),
      };
    } catch (error: any) {
      console.error(' [Cache Service] 获取统计信息失败:', error);
      return {
        totalCaches: 0,
        totalHits: 0,
        caches: [],
      };
    }
  }
}

// 导出单例
export const requestCacheService = new RequestCacheService();
