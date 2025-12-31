/**
 * 保存请求缓存用例
 * 
 * 将请求和响应保存到缓存中，供后续相似请求使用
 */

import type { IRequestCacheRepository } from '../../interfaces/repositories/request-cache.repository.interface.js';
import type { RequestCacheEntity, CreateRequestCacheParams } from '../../../domain/entities/request-cache.entity.js';
import { createRequestCache } from '../../../domain/entities/request-cache.entity.js';

export class SaveRequestCacheUseCase {
  constructor(private readonly cacheRepository: IRequestCacheRepository) {}

  /**
   * 执行保存
   * 
   * @param params - 缓存参数
   * @returns 保存后的缓存实体
   */
  async execute(params: CreateRequestCacheParams): Promise<RequestCacheEntity> {
    console.log(`💾 [Cache] 保存缓存: userId=${params.userId}, modelType=${params.modelType}`);
    console.log(`📝 [Cache] 请求长度: ${params.requestText.length} 字符`);
    console.log(`📝 [Cache] 响应长度: ${params.responseContent.length} 字符`);
    console.log(`🔢 [Cache] Embedding 维度: ${params.requestEmbedding.length}`);

    // 创建缓存实体
    const cacheEntity = createRequestCache(params);

    // 保存到数据库
    const savedCache = await this.cacheRepository.save(cacheEntity);

    console.log(`✅ [Cache] 缓存已保存: ${savedCache.cacheId}`);

    return savedCache;
  }
}

