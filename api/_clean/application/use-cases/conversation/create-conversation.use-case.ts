/**
 * Create Conversation Use Case
 * 应用层：编排业务流程，创建新会话
 */

import { v4 as uuidv4 } from 'uuid';
import { ConversationEntity } from '../../../domain/entities/conversation.entity.js';
import { IConversationRepository } from '../../interfaces/repositories/conversation.repository.interface.js';

export class CreateConversationUseCase {
  constructor(
    private readonly conversationRepository: IConversationRepository
  ) {}

  /**
   * 执行创建会话的业务流程
   */
  async execute(userId: string, title?: string): Promise<ConversationEntity> {
    // 1. 生成 ID
    const conversationId = uuidv4();

    // 2. 创建 Domain Entity（包含业务规则验证）
    const conversation = ConversationEntity.create(conversationId, userId, title);

    // 3. 持久化
    await this.conversationRepository.save(conversation);

    return conversation;
  }
}

