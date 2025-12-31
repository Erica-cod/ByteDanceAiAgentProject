/**
 * 清理过期缓存用例
 * 
 * 定期清理过期的缓存记录（可选，因为 MongoDB TTL 索引会自动清理）
 */

import type { IRequestCacheRepository } from '../../interfaces/repositories/request-cache.repository.interface.js';

export class CleanupExpiredCachesUseCase {
  constructor(private readonly cacheRepository: IRequestCacheRepository) {}

  /**
   * 执行清理
   * 
   * @returns 删除的缓存数量
   */
  async execute(): Promise<number> {
    console.log('🧹 [Cache] 开始清理过期缓存...');

    const deletedCount = await this.cacheRepository.deleteExpired();

    if (deletedCount > 0) {
      console.log(`✅ [Cache] 清理完成，删除了 ${deletedCount} 个过期缓存`);
    } else {
      console.log('✅ [Cache] 没有过期缓存需要清理');
    }

    return deletedCount;
  }
}

