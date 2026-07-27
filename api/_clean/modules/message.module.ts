import { IMessageRepository } from '../application/interfaces/repositories/message.repository.interface.js';
import { MessageRepository } from '../infrastructure/repositories/message.repository.js';
import { CreateMessageUseCase } from '../application/use-cases/message/create-message.use-case.js';
import { GetMessagesUseCase } from '../application/use-cases/message/get-messages.use-case.js';
import { GetMessageContentRangeUseCase } from '../application/use-cases/message/get-message-content-range.use-case.js';
import { MongoMemoryRepository } from '../infrastructure/repositories/memory.repository.js';
import { ConversationMemoryIndexer } from '../application/services/conversation-memory-indexer.js';
import { embeddingService } from '../infrastructure/llm/embedding.service.js';

export class MessageModule {
  constructor(private instances: Map<string, any>) {}

  getMessageRepository(): IMessageRepository {
    if (!this.instances.has('MessageRepository')) {
      this.instances.set('MessageRepository', new MessageRepository());
    }
    return this.instances.get('MessageRepository');
  }

  private getMemoryIndexer(): ConversationMemoryIndexer {
    if (!this.instances.has('MemoryRepository')) {
      this.instances.set('MemoryRepository', new MongoMemoryRepository());
    }
    if (!this.instances.has('ConversationMemoryIndexer')) {
      this.instances.set(
        'ConversationMemoryIndexer',
        new ConversationMemoryIndexer(
          this.instances.get('MemoryRepository'),
          embeddingService
        )
      );
    }
    return this.instances.get('ConversationMemoryIndexer');
  }

  getCreateMessageUseCase() {
    return new CreateMessageUseCase(
      this.getMessageRepository(),
      this.getMemoryIndexer()
    );
  }
  getGetMessagesUseCase() { return new GetMessagesUseCase(this.getMessageRepository()); }
  getGetMessageContentRangeUseCase() { return new GetMessageContentRangeUseCase(this.getMessageRepository()); }
}
