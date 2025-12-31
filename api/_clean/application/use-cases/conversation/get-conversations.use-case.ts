/**
 * Get Conversations Use Case
 * 应用层：编排业务流程，获取用户的会话列表
 */

import { ConversationEntity } from '../../../domain/entities/conversation.entity.js';
import { IConversationRepository } from '../../interfaces/repositories/conversation.repository.interface.js';

export class GetConversationsUseCase {
  constructor(
    private readonly conversationRepository: IConversationRepository
  ) {}

  /**
   * 执行获取会话列表的业务流程
   */
  async execute(
    userId: string,
    limit: number = 20,
    skip: number = 0
  ): Promise<{
    conversations: ConversationEntity[];
    total: number;
  }> {
    // 参数验证
    if (!userId) {
      throw new Error('userId is required');
    }
    if (limit <= 0 || limit > 100) {
      throw new Error('limit must be between 1 and 100');
    }
    if (skip < 0) {
      throw new Error('skip must be non-negative');
    }

    // 查询会话列表
    return await this.conversationRepository.findByUserId(userId, limit, skip);
  }
}

