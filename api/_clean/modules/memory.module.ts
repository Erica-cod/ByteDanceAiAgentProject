import { IMemoryRepository } from '../application/interfaces/repositories/memory.repository.interface.js';
import { MongoMemoryRepository } from '../infrastructure/repositories/memory.repository.js';
import { GetConversationContextUseCase } from '../application/use-cases/memory/get-conversation-context.use-case.js';
import { GetMemoryStatsUseCase } from '../application/use-cases/memory/get-memory-stats.use-case.js';
import { ConversationMemoryMaintenanceService } from '../application/services/conversation-memory-maintenance.js';

export class MemoryModule {
  constructor(private instances: Map<string, any>) {}

  getMemoryRepository(): IMemoryRepository {
    if (!this.instances.has('MemoryRepository')) {
      this.instances.set('MemoryRepository', new MongoMemoryRepository());
    }
    return this.instances.get('MemoryRepository');
  }

  getGetConversationContextUseCase() { return new GetConversationContextUseCase(this.getMemoryRepository()); }
  getGetMemoryStatsUseCase() { return new GetMemoryStatsUseCase(this.getMemoryRepository()); }

  getConversationMemoryMaintenanceService() {
    if (!this.instances.has('ConversationMemoryMaintenanceService')) {
      this.instances.set(
        'ConversationMemoryMaintenanceService',
        new ConversationMemoryMaintenanceService(this.getMemoryRepository())
      );
    }
    return this.instances.get(
      'ConversationMemoryMaintenanceService'
    ) as ConversationMemoryMaintenanceService;
  }
}
