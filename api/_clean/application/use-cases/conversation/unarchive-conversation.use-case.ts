/**
 * Unarchive Conversation Use Case
 */

import { IConversationRepository } from '../../interfaces/repositories/conversation.repository.interface.js';

export class UnarchiveConversationUseCase {
  constructor(private readonly repo: IConversationRepository) {}

  async execute(conversationId: string, userId: string): Promise<boolean> {
    const conversation = await this.repo.findArchivedById(conversationId, userId);
    if (!conversation) return false;

    conversation.unarchive();
    return this.repo.unarchive(conversation);
  }
}
