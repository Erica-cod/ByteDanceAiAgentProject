import type { IAgentSessionRepository } from '../application/interfaces/repositories/agent-session.repository.interface.js';
import { MongoAgentSessionRepository } from '../infrastructure/repositories/agent-session.repository.js';
import { SaveSessionUseCase } from '../application/use-cases/agent-session/save-session.use-case.js';
import { LoadSessionUseCase } from '../application/use-cases/agent-session/load-session.use-case.js';
import { DeleteSessionUseCase } from '../application/use-cases/agent-session/delete-session.use-case.js';
import { CleanExpiredSessionsUseCase } from '../application/use-cases/agent-session/clean-expired-sessions.use-case.js';
import { GetSessionStatsUseCase } from '../application/use-cases/agent-session/get-session-stats.use-case.js';

export class AgentSessionModule {
  constructor(private instances: Map<string, any>) {}

  getAgentSessionRepository(): IAgentSessionRepository {
    if (!this.instances.has('AgentSessionRepository')) {
      this.instances.set('AgentSessionRepository', new MongoAgentSessionRepository());
    }
    return this.instances.get('AgentSessionRepository');
  }

  getSaveSessionUseCase() { return new SaveSessionUseCase(this.getAgentSessionRepository()); }
  getLoadSessionUseCase() { return new LoadSessionUseCase(this.getAgentSessionRepository()); }
  getDeleteSessionUseCase() { return new DeleteSessionUseCase(this.getAgentSessionRepository()); }
  getCleanExpiredSessionsUseCase() { return new CleanExpiredSessionsUseCase(this.getAgentSessionRepository()); }
  getGetSessionStatsUseCase() { return new GetSessionStatsUseCase(this.getAgentSessionRepository()); }

  async ensureAgentSessionIndexes(): Promise<void> {
    await this.getAgentSessionRepository().ensureTTLIndex();
  }
}
