/**
 * 获取缓存统计用例
 * 
 * 获取用户的缓存使用统计信息
 */

import type { IRequestCacheRepository } from '../../interfaces/repositories/request-cache.repository.interface.js';

export interface CacheStats {
  /**
   * 总缓存数
   */
  totalCaches: number;

  /**
   * 总命中次数
   */
  totalHits: number;

  /**
   * 平均命中次数
   */
  avgHitCount: number;

  /**
   * 命中率（总命中次数 / (总缓存数 + 总命中次数)）
   */
  hitRate: number;

  /**
   * 最早的缓存时间
   */
  oldestCache: Date | null;

  /**
   * 最新的缓存时间
   */
  newestCache: Date | null;
}

export class GetCacheStatsUseCase {
  constructor(private readonly cacheRepository: IRequestCacheRepository) {}

  /**
   * 执行获取
   * 
   * @param userId - 用户ID
   * @returns 缓存统计信息
   */
  async execute(userId: string): Promise<CacheStats> {
    console.log(`📊 [Cache] 获取缓存统计: userId=${userId}`);

    const stats = await this.cacheRepository.getStats(userId);

    // 计算命中率
    const totalRequests = stats.totalCaches + stats.totalHits;
    const hitRate = totalRequests > 0 ? stats.totalHits / totalRequests : 0;

    const result: CacheStats = {
      ...stats,
      hitRate,
    };

    console.log(`✅ [Cache] 统计信息:`, {
      totalCaches: result.totalCaches,
      totalHits: result.totalHits,
      hitRate: `${(result.hitRate * 100).toFixed(2)}%`,
    });

    return result;
  }
}

