import { IMessageRepository } from '../application/interfaces/repositories/message.repository.interface.js';
import { MessageRepository } from '../infrastructure/repositories/message.repository.js';
import { CreateMessageUseCase } from '../application/use-cases/message/create-message.use-case.js';
import { GetMessagesUseCase } from '../application/use-cases/message/get-messages.use-case.js';
import { GetMessageContentRangeUseCase } from '../application/use-cases/message/get-message-content-range.use-case.js';

export class MessageModule {
  constructor(private instances: Map<string, any>) {}

  getMessageRepository(): IMessageRepository {
    if (!this.instances.has('MessageRepository')) {
      this.instances.set('MessageRepository', new MessageRepository());
    }
    return this.instances.get('MessageRepository');
  }

  getCreateMessageUseCase() { return new CreateMessageUseCase(this.getMessageRepository()); }
  getGetMessagesUseCase() { return new GetMessagesUseCase(this.getMessageRepository()); }
  getGetMessageContentRangeUseCase() { return new GetMessageContentRangeUseCase(this.getMessageRepository()); }
}
