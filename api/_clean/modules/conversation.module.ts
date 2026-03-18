import { IConversationRepository } from '../application/interfaces/repositories/conversation.repository.interface.js';
import { ConversationRepository } from '../infrastructure/repositories/conversation.repository.js';
import { CreateConversationUseCase } from '../application/use-cases/conversation/create-conversation.use-case.js';
import { GetConversationsUseCase } from '../application/use-cases/conversation/get-conversations.use-case.js';
import { GetConversationUseCase } from '../application/use-cases/conversation/get-conversation.use-case.js';
import { UpdateConversationUseCase } from '../application/use-cases/conversation/update-conversation.use-case.js';
import { DeleteConversationUseCase } from '../application/use-cases/conversation/delete-conversation.use-case.js';
import { ArchiveConversationUseCase } from '../application/use-cases/conversation/archive-conversation.use-case.js';
import { UnarchiveConversationUseCase } from '../application/use-cases/conversation/unarchive-conversation.use-case.js';
import { GetArchivedConversationsUseCase } from '../application/use-cases/conversation/get-archived-conversations.use-case.js';

export class ConversationModule {
  constructor(private instances: Map<string, any>) {}

  getConversationRepository(): IConversationRepository {
    if (!this.instances.has('ConversationRepository')) {
      this.instances.set('ConversationRepository', new ConversationRepository());
    }
    return this.instances.get('ConversationRepository');
  }

  getCreateConversationUseCase() { return new CreateConversationUseCase(this.getConversationRepository()); }
  getGetConversationsUseCase() { return new GetConversationsUseCase(this.getConversationRepository()); }
  getGetConversationUseCase() { return new GetConversationUseCase(this.getConversationRepository()); }
  getUpdateConversationUseCase() { return new UpdateConversationUseCase(this.getConversationRepository()); }
  getDeleteConversationUseCase() { return new DeleteConversationUseCase(this.getConversationRepository()); }
  getArchiveConversationUseCase() { return new ArchiveConversationUseCase(this.getConversationRepository()); }
  getUnarchiveConversationUseCase() { return new UnarchiveConversationUseCase(this.getConversationRepository()); }
  getGetArchivedConversationsUseCase() { return new GetArchivedConversationsUseCase(this.getConversationRepository()); }
}
