/**
 * 获取缓存响应用例
 * 
 * 根据缓存ID获取响应内容，并更新命中统计
 */

import type { IRequestCacheRepository } from '../../interfaces/repositories/request-cache.repository.interface.js';
import type { RequestCacheEntity } from '../../../domain/entities/request-cache.entity.js';

export interface CachedResponse {
  /**
   * 响应内容
   */
  content: string;

  /**
   * 思考过程（可选）
   */
  thinking?: string;

  /**
   * 模型类型
   */
  modelType: 'local' | 'volcano';

  /**
   * 缓存命中次数
   */
  hitCount: number;

  /**
   * 缓存创建时间
   */
  createdAt: Date;
}

export class GetCachedResponseUseCase {
  constructor(private readonly cacheRepository: IRequestCacheRepository) {}

  /**
   * 执行获取
   * 
   * @param cacheId - 缓存ID
   * @param updateHit - 是否更新命中统计（默认 true）
   * @returns 缓存的响应，如果不存在返回 null
   */
  async execute(cacheId: string, updateHit: boolean = true): Promise<CachedResponse | null> {
    console.log(`📦 [Cache] 获取缓存响应: ${cacheId}`);

    // 1. 查询缓存
    const cache = await this.cacheRepository.findById(cacheId);

    if (!cache) {
      console.log(`📭 [Cache] 缓存不存在或已过期: ${cacheId}`);
      return null;
    }

    // 2. 更新命中统计
    if (updateHit) {
      await this.cacheRepository.updateHit(cacheId);
      console.log(`✅ [Cache] 缓存命中: ${cacheId} (命中次数: ${cache.hitCount + 1})`);
    }

    // 3. 返回响应
    return {
      content: cache.responseContent,
      thinking: cache.responseThinking,
      modelType: cache.modelType,
      hitCount: cache.hitCount + 1,
      createdAt: cache.createdAt,
    };
  }
}

