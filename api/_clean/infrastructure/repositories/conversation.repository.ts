/**
 * Conversation Repository Implementation
 * 基础设施层：实现 Repository 接口，包装现有的 ConversationService
 * 
 * 🔑 关键策略：内部调用现有的 ConversationService，实现渐进式迁移
 */

import { ConversationEntity } from '../../domain/entities/conversation.entity.js';
import { IConversationRepository } from '../../application/interfaces/repositories/conversation.repository.interface.js';
import { ConversationService } from '../../../services/conversationService.js';

export class ConversationRepository implements IConversationRepository {
  /**
   * 保存新的 Conversation
   * 内部调用现有的 ConversationService
   */
  async save(conversation: ConversationEntity): Promise<void> {
    const data = conversation.toPersistence();
    
    // 调用现有的 Service（包装模式）
    await ConversationService.createConversation(
      data.userId,
      data.title
    );
  }

  /**
   * 根据 ID 查找 Conversation
   */
  async findById(conversationId: string, userId: string): Promise<ConversationEntity | null> {
    // 调用现有的 Service
    const data = await ConversationService.getConversation(conversationId, userId);
    
    if (!data) {
      return null;
    }

    // 转换为 Domain Entity
    return ConversationEntity.fromPersistence({
      conversationId: data.conversationId,
      userId: data.userId,
      title: data.title,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      messageCount: data.messageCount,
      isActive: data.isActive,
    });
  }

  /**
   * 查找用户的所有 Conversation
   */
  async findByUserId(
    userId: string,
    limit: number,
    skip: number
  ): Promise<{
    conversations: ConversationEntity[];
    total: number;
  }> {
    // 调用现有的 Service
    const result = await ConversationService.getUserConversations(userId, limit, skip);

    // 转换为 Domain Entities
    const conversations = result.conversations.map((data) =>
      ConversationEntity.fromPersistence({
        conversationId: data.conversationId,
        userId: data.userId,
        title: data.title,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        messageCount: data.messageCount,
        isActive: data.isActive,
      })
    );

    return {
      conversations,
      total: result.total,
    };
  }

  /**
   * 更新 Conversation
   */
  async update(conversation: ConversationEntity): Promise<void> {
    const data = conversation.toPersistence();
    
    // 调用现有的 Service
    await ConversationService.updateConversation(
      data.conversationId,
      data.userId,
      {
        title: data.title,
        updatedAt: data.updatedAt,
        messageCount: data.messageCount,
        isActive: data.isActive,
      }
    );
  }

  /**
   * 删除 Conversation（软删除）
   */
  async delete(conversationId: string, userId: string): Promise<boolean> {
    // 调用现有的 Service
    return await ConversationService.deleteConversation(conversationId, userId);
  }
}

