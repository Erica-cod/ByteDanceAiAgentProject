/**
 * Archive Conversation Use Case
 */

import { IConversationRepository } from '../../interfaces/repositories/conversation.repository.interface.js';

export class ArchiveConversationUseCase {
  constructor(private readonly repo: IConversationRepository) {}

  async execute(conversationId: string, userId: string): Promise<boolean> {
    const conversation = await this.repo.findById(conversationId, userId);
    if (!conversation) return false;

    conversation.archive();
    return this.repo.archive(conversation);
  }
}
