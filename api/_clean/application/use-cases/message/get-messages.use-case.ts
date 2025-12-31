/**
 * Get Messages Use Case - 获取消息列表用例
 * 
 * 职责：
 * - 根据 conversationId 获取消息列表
 * - 支持分页
 */

import { IMessageRepository } from '../../interfaces/repositories/message.repository.interface.js';
import { MessageEntity } from '../../../domain/entities/message.entity.js';

export class GetMessagesUseCase {
  constructor(private messageRepository: IMessageRepository) {}

  async execute(
    conversationId: string,
    userId: string,
    limit: number,
    skip: number
  ): Promise<{ messages: MessageEntity[]; total: number }> {
    return this.messageRepository.findByConversationId(
      conversationId,
      userId,
      limit,
      skip
    );
  }
}

