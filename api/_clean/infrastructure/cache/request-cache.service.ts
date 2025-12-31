/**
 * 请求缓存服务
 * 
 * 封装 embedding 计算和缓存查找逻辑，提供高级缓存功能
 * 
 * ✅ 已重构：使用共享的 embedding 服务
 */

import { getContainer } from '../../di-container.js';
import type { FindSimilarCachedRequestParams } from '../../application/use-cases/request-cache/find-similar-cached-request.use-case.js';
import type { CreateRequestCacheParams } from '../../domain/entities/request-cache.entity.js';
import type { CachedResponse } from '../../application/use-cases/request-cache/get-cached-response.use-case.js';
import { embeddingService, type IEmbeddingService } from '../llm/embedding.service.js';

/**
 * 请求缓存服务
 */
export class RequestCacheService {
  private embeddingService: IEmbeddingService;

  constructor(embeddingServiceInstance?: IEmbeddingService) {
    // ✅ 使用共享的 embedding 服务单例
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
      console.log('⚠️  [Cache Service] Embedding 服务未配置，跳过缓存查找');
      return null;
    }

    try {
      console.log(`🔍 [Cache Service] 查找缓存: "${requestText.slice(0, 50)}..."`);

      // 1. 计算请求的 embedding
      const requestEmbedding = await this.embeddingService.getEmbedding(requestText);
      console.log(`✅ [Cache Service] Embedding 计算完成 (维度: ${requestEmbedding.length})`);

      // 2. 查找相似的缓存
      const container = getContainer();
      const findSimilarUseCase = container.getFindSimilarCachedRequestUseCase();

      const params: FindSimilarCachedRequestParams = {
        userId,
        requestEmbedding,
        modelType: options?.modelType,
        mode: options?.mode,
        similarityThreshold: options?.similarityThreshold || 0.95,
        maxResults: 1,
      };

      const results = await findSimilarUseCase.execute(params);

      if (results.length === 0) {
        console.log('📭 [Cache Service] 没有找到相似的缓存');
        return null;
      }

      // 3. 获取缓存的响应
      const topResult = results[0];
      console.log(
        `🎯 [Cache Service] 找到缓存命中! ` +
        `相似度: ${(topResult.similarity * 100).toFixed(2)}%, ` +
        `cacheId: ${topResult.cache.cacheId}`
      );

      const getCachedResponseUseCase = container.getGetCachedResponseUseCase();
      const cachedResponse = await getCachedResponseUseCase.execute(topResult.cache.cacheId);

      return cachedResponse;
    } catch (error: any) {
      console.error('❌ [Cache Service] 查找缓存失败:', error);
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
      ttlDays?: number;
    }
  ): Promise<void> {
    if (!this.isAvailable()) {
      console.log('⚠️  [Cache Service] Embedding 服务未配置，跳过缓存保存');
      return;
    }

    try {
      console.log(`💾 [Cache Service] 保存到缓存: "${requestText.slice(0, 50)}..."`);

      // 1. 计算请求的 embedding
      const requestEmbedding = await this.embeddingService.getEmbedding(requestText);
      console.log(`✅ [Cache Service] Embedding 计算完成 (维度: ${requestEmbedding.length})`);

      // 2. 保存到缓存
      const container = getContainer();
      const saveUseCase = container.getSaveRequestCacheUseCase();

      const params: CreateRequestCacheParams = {
        userId,
        requestText,
        requestEmbedding,
        responseContent,
        responseThinking: options.responseThinking,
        modelType: options.modelType,
        mode: options.mode || 'single',
        metadata: options.metadata,
        ttlDays: options.ttlDays,
      };

      await saveUseCase.execute(params);
      console.log('✅ [Cache Service] 缓存保存成功');
    } catch (error: any) {
      console.error('❌ [Cache Service] 保存缓存失败:', error);
      // 不抛出错误，缓存失败不应该影响主流程
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(userId: string) {
    const container = getContainer();
    const getStatsUseCase = container.getGetCacheStatsUseCase();
    return await getStatsUseCase.execute(userId);
  }

  /**
   * 清理过期缓存
   */
  async cleanupExpired() {
    const container = getContainer();
    const cleanupUseCase = container.getCleanupExpiredCachesUseCase();
    return await cleanupUseCase.execute();
  }
}

// 导出单例
export const requestCacheService = new RequestCacheService();

