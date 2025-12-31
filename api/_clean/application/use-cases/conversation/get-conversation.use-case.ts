/**
 * Get Conversation Use Case
 * 应用层：获取单个对话的详情
 */

import { ConversationEntity } from '../../../domain/entities/conversation.entity.js';
import { IConversationRepository } from '../../interfaces/repositories/conversation.repository.interface.js';

export class GetConversationUseCase {
  constructor(
    private readonly conversationRepository: IConversationRepository
  ) {}

  /**
   * 执行获取对话详情的业务流程
   */
  async execute(conversationId: string, userId: string): Promise<ConversationEntity | null> {
    // 参数验证
    if (!conversationId) {
      throw new Error('conversationId is required');
    }
    if (!userId) {
      throw new Error('userId is required');
    }

    // 查询对话
    const conversation = await this.conversationRepository.findById(conversationId, userId);
    
    if (!conversation) {
      return null;
    }
    
    // 验证权限
    if (!conversation.belongsTo(userId)) {
      throw new Error('Access denied');
    }
    
    return conversation;
  }
}

