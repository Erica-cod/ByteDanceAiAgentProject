/**
 * 请求缓存服务
 * 
 * 封装 embedding 计算和缓存查找逻辑，提供高级缓存功能
 */

import { getContainer } from '../../di-container.js';
import type { FindSimilarCachedRequestParams } from '../../application/use-cases/request-cache/find-similar-cached-request.use-case.js';
import type { CreateRequestCacheParams } from '../../domain/entities/request-cache.entity.js';
import type { CachedResponse } from '../../application/use-cases/request-cache/get-cached-response.use-case.js';

/**
 * Embedding 服务接口（用于依赖注入）
 */
export interface IEmbeddingService {
  getEmbedding(text: string): Promise<number[]>;
  isConfigured(): boolean;
}

/**
 * 使用火山引擎 Embedding 服务
 */
class VolcengineEmbeddingServiceAdapter implements IEmbeddingService {
  private apiKey: string;
  private apiUrl: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.ARK_API_KEY || '';
    this.apiUrl = process.env.ARK_EMBEDDING_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/embeddings';
    this.model = process.env.ARK_EMBEDDING_MODEL || 'doubao-embedding-text-240715';
  }

  async getEmbedding(text: string): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error('ARK_API_KEY 未配置，无法使用 embedding 功能');
    }

    try {
      const fetch = (await import('node-fetch')).default;
      
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: text,
          encoding_format: 'float',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding API 错误 (${response.status}): ${errorText}`);
      }

      const data: any = await response.json();
      
      if (data.data && data.data[0] && data.data[0].embedding) {
        return data.data[0].embedding;
      }

      throw new Error('Embedding API 返回格式错误');
    } catch (error: any) {
      console.error('❌ [Cache Service] 获取 embedding 失败:', error);
      throw error;
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

/**
 * 请求缓存服务
 */
export class RequestCacheService {
  private embeddingService: IEmbeddingService;

  constructor(embeddingService?: IEmbeddingService) {
    this.embeddingService = embeddingService || new VolcengineEmbeddingServiceAdapter();
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

