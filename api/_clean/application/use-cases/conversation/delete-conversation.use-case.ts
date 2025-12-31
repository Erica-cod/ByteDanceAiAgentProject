/**
 * Delete Conversation Use Case
 * 应用层：删除对话（软删除）
 */

import { IConversationRepository } from '../../interfaces/repositories/conversation.repository.interface.js';

export class DeleteConversationUseCase {
  constructor(
    private readonly conversationRepository: IConversationRepository
  ) {}

  /**
   * 执行删除对话的业务流程
   */
  async execute(conversationId: string, userId: string): Promise<boolean> {
    // 参数验证
    if (!conversationId) {
      throw new Error('conversationId is required');
    }
    if (!userId) {
      throw new Error('userId is required');
    }

    // 验证对话存在且属于用户
    const conversation = await this.conversationRepository.findById(conversationId, userId);
    
    if (!conversation) {
      throw new Error('Conversation not found');
    }
    
    if (!conversation.belongsTo(userId)) {
      throw new Error('Access denied');
    }
    
    // 软删除
    const success = await this.conversationRepository.delete(conversationId, userId);
    
    return success;
  }
}

