import type { IRequestCacheRepository } from '../application/interfaces/repositories/request-cache.repository.interface.js';
import { MongoRequestCacheRepository } from '../infrastructure/repositories/request-cache.repository.js';
import { FindSimilarCachedRequestUseCase } from '../application/use-cases/request-cache/find-similar-cached-request.use-case.js';
import { SaveRequestCacheUseCase } from '../application/use-cases/request-cache/save-request-cache.use-case.js';
import { GetCachedResponseUseCase } from '../application/use-cases/request-cache/get-cached-response.use-case.js';
import { CleanupExpiredCachesUseCase } from '../application/use-cases/request-cache/cleanup-expired-caches.use-case.js';
import { GetCacheStatsUseCase } from '../application/use-cases/request-cache/get-cache-stats.use-case.js';

export class RequestCacheModule {
  constructor(private instances: Map<string, any>) {}

  getRequestCacheRepository(): IRequestCacheRepository {
    if (!this.instances.has('RequestCacheRepository')) {
      this.instances.set('RequestCacheRepository', new MongoRequestCacheRepository());
    }
    return this.instances.get('RequestCacheRepository');
  }

  getFindSimilarCachedRequestUseCase() { return new FindSimilarCachedRequestUseCase(this.getRequestCacheRepository()); }
  getSaveRequestCacheUseCase() { return new SaveRequestCacheUseCase(this.getRequestCacheRepository()); }
  getGetCachedResponseUseCase() { return new GetCachedResponseUseCase(this.getRequestCacheRepository()); }
  getCleanupExpiredCachesUseCase() { return new CleanupExpiredCachesUseCase(this.getRequestCacheRepository()); }
  getGetCacheStatsUseCase() { return new GetCacheStatsUseCase(this.getRequestCacheRepository()); }

  async ensureRequestCacheIndexes(): Promise<void> {
    await this.getRequestCacheRepository().ensureIndexes();
  }
}
