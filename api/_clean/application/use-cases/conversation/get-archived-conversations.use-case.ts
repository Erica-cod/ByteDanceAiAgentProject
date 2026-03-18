/**
 * Get Archived Conversations Use Case
 */

import { ConversationEntity } from '../../../domain/entities/conversation.entity.js';
import { IConversationRepository } from '../../interfaces/repositories/conversation.repository.interface.js';

export class GetArchivedConversationsUseCase {
  constructor(private readonly repo: IConversationRepository) {}

  async execute(
    userId: string,
    limit: number = 20,
    skip: number = 0
  ): Promise<{
    conversations: ConversationEntity[];
    total: number;
  }> {
    return this.repo.findArchivedByUserId(userId, limit, skip);
  }
}
