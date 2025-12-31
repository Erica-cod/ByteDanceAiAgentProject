/**
 * Create Message Use Case - 创建消息用例
 * 
 * 职责：
 * - 编排消息创建的业务逻辑
 * - 验证数据
 * - 保存消息到数据库
 */

import { MessageEntity } from '../../../domain/entities/message.entity.js';
import { IMessageRepository } from '../../interfaces/repositories/message.repository.interface.js';

export class CreateMessageUseCase {
  constructor(private messageRepository: IMessageRepository) {}

  async execute(
    conversationId: string,
    userId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    clientMessageId?: string,
    modelType?: 'local' | 'volcano',
    thinking?: string,
    sources?: Array<{ title: string; url: string }>,
    metadata?: { tokens?: number; duration?: number }
  ): Promise<MessageEntity> {
    const message = MessageEntity.create(
      conversationId,
      userId,
      role,
      content,
      clientMessageId,
      modelType,
      thinking,
      sources,
      metadata
    );

    await this.messageRepository.save(message);
    return message;
  }
}

