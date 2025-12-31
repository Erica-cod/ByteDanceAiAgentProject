/**
 * Update Conversation Use Case
 * 应用层：更新对话信息
 */

import { ConversationEntity } from '../../../domain/entities/conversation.entity.js';
import { IConversationRepository } from '../../interfaces/repositories/conversation.repository.interface.js';

export class UpdateConversationUseCase {
  constructor(
    private readonly conversationRepository: IConversationRepository
  ) {}

  /**
   * 执行更新对话的业务流程
   */
  async execute(
    conversationId: string,
    userId: string,
    updates: { title?: string; messageCount?: number }
  ): Promise<ConversationEntity> {
    // 参数验证
    if (!conversationId) {
      throw new Error('conversationId is required');
    }
    if (!userId) {
      throw new Error('userId is required');
    }

    // 获取现有对话
    const conversation = await this.conversationRepository.findById(conversationId, userId);
    
    if (!conversation) {
      throw new Error('Conversation not found');
    }
    
    // 验证权限
    if (!conversation.belongsTo(userId)) {
      throw new Error('Access denied');
    }
    
    // 应用更新（使用 Entity 的业务规则）
    if (updates.title !== undefined) {
      conversation.updateTitle(updates.title);
    }
    
    if (updates.messageCount !== undefined) {
      // 更新消息计数
      conversation.incrementMessageCount();
    }
    
    // 持久化
    await this.conversationRepository.update(conversation);
    
    return conversation;
  }
}

