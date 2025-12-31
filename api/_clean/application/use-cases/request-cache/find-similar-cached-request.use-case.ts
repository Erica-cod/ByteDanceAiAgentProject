/**
 * 查找相似缓存请求用例
 * 
 * 使用 embedding 向量计算余弦相似度，查找最相似的缓存请求
 */

import type { IRequestCacheRepository } from '../../interfaces/repositories/request-cache.repository.interface.js';
import type { RequestCacheEntity } from '../../../domain/entities/request-cache.entity.js';
import { cosineSimilarity } from '../../../shared/utils/similarity-calculator.js';

export interface FindSimilarCachedRequestParams {
  /**
   * 用户ID
   */
  userId: string;

  /**
   * 请求的 embedding 向量
   */
  requestEmbedding: number[];

  /**
   * 模型类型（可选，如果提供则只在该模型的缓存中查找）
   */
  modelType?: 'local' | 'volcano';

  /**
   * 请求模式（可选）
   */
  mode?: 'single' | 'multi_agent' | 'chunking';

  /**
   * 相似度阈值（0-1），只返回相似度超过此阈值的缓存
   * 默认 0.95（非常相似）
   */
  similarityThreshold?: number;

  /**
   * 最多返回几个结果
   * 默认 1（只返回最相似的）
   */
  maxResults?: number;
}

export interface SimilarCacheResult {
  /**
   * 缓存实体
   */
  cache: RequestCacheEntity;

  /**
   * 相似度分数（0-1）
   */
  similarity: number;
}

export class FindSimilarCachedRequestUseCase {
  constructor(private readonly cacheRepository: IRequestCacheRepository) {}

  /**
   * 执行查找
   * 
   * @param params - 查找参数
   * @returns 相似的缓存列表（按相似度降序排列）
   */
  async execute(params: FindSimilarCachedRequestParams): Promise<SimilarCacheResult[]> {
    const {
      userId,
      requestEmbedding,
      modelType,
      mode,
      similarityThreshold = 0.95, // 默认阈值 95%
      maxResults = 1,
    } = params;

    console.log(`🔍 [Cache] 查找相似缓存: userId=${userId}, threshold=${similarityThreshold}`);

    // 1. 获取用户的所有有效缓存
    const caches = await this.cacheRepository.findByUser(userId, modelType, mode);

    if (caches.length === 0) {
      console.log('📭 [Cache] 用户没有缓存');
      return [];
    }

    console.log(`📦 [Cache] 找到 ${caches.length} 个候选缓存`);

    // 2. 计算每个缓存的相似度
    const results: SimilarCacheResult[] = [];

    for (const cache of caches) {
      try {
        const similarity = cosineSimilarity(requestEmbedding, cache.requestEmbedding);
        
        // 只保留超过阈值的结果
        if (similarity >= similarityThreshold) {
          results.push({ cache, similarity });
          console.log(`✨ [Cache] 找到相似缓存: ${cache.cacheId} (相似度: ${(similarity * 100).toFixed(2)}%)`);
        }
      } catch (error) {
        console.error(`⚠️  [Cache] 计算相似度失败 (cacheId=${cache.cacheId}):`, error);
        // 继续处理下一个缓存
      }
    }

    // 3. 按相似度降序排序
    results.sort((a, b) => b.similarity - a.similarity);

    // 4. 返回前 N 个结果
    const topResults = results.slice(0, maxResults);

    if (topResults.length > 0) {
      console.log(
        `✅ [Cache] 找到 ${topResults.length} 个相似缓存, ` +
        `最高相似度: ${(topResults[0].similarity * 100).toFixed(2)}%`
      );
    } else {
      console.log('📭 [Cache] 没有找到足够相似的缓存');
    }

    return topResults;
  }
}

