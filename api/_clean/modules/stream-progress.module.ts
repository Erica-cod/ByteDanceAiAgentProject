import type { IStreamProgressRepository } from '../application/interfaces/repositories/stream-progress.repository.interface.js';
import { StreamProgressRepository } from '../infrastructure/repositories/stream-progress.repository.js';

export class StreamProgressModule {
  constructor(private instances: Map<string, any>) {}

  getStreamProgressRepository(): IStreamProgressRepository {
    if (!this.instances.has('StreamProgressRepository')) {
      this.instances.set('StreamProgressRepository', new StreamProgressRepository());
    }
    return this.instances.get('StreamProgressRepository');
  }

  async ensureStreamProgressIndexes(): Promise<void> {
    await this.getStreamProgressRepository().ensureIndexes();
  }
}
