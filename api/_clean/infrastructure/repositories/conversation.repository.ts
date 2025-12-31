/**
 * Conversation Repository Implementation
 * 基础设施层：实现 Repository 接口，包装现有的数据库操作
 * 
 * 🔑 关键策略：直接操作数据库，确保使用 Entity 中的数据
 */

import { ConversationEntity } from '../../domain/entities/conversation.entity.js';
import { IConversationRepository } from '../../application/interfaces/repositories/conversation.repository.interface.js';
import { getDatabase } from '../../../db/connection.js';
import { Conversation } from '../../../db/models.js';

export class ConversationRepository implements IConversationRepository {
  /**
   * 保存新的 Conversation
   * 直接操作数据库，使用 Entity 中的数据
   */
  async save(conversation: ConversationEntity): Promise<void> {
    const data = conversation.toPersistence();
    const db = await getDatabase();
    const collection = db.collection<Conversation>('conversations');
    
    await collection.insertOne(data as Conversation);
  }

  /**
   * 根据 ID 查找 Conversation
   */
  async findById(conversationId: string, userId: string): Promise<ConversationEntity | null> {
    const db = await getDatabase();
    const collection = db.collection<Conversation>('conversations');
    
    const data = await collection.findOne({ conversationId, userId });
    
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
    const db = await getDatabase();
    const collection = db.collection<Conversation>('conversations');

    const conversations = await collection
      .find({ userId, isActive: true })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    const total = await collection.countDocuments({ userId, isActive: true });

    // 转换为 Domain Entities
    const entities = conversations.map((data: Conversation) =>
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
      conversations: entities,
      total,
    };
  }

  /**
   * 更新 Conversation
   */
  async update(conversation: ConversationEntity): Promise<void> {
    const data = conversation.toPersistence();
    const db = await getDatabase();
    const collection = db.collection<Conversation>('conversations');
    
    await collection.updateOne(
      { conversationId: data.conversationId, userId: data.userId },
      {
        $set: {
          title: data.title,
          updatedAt: data.updatedAt,
          messageCount: data.messageCount,
          isActive: data.isActive,
        },
      }
    );
  }

  /**
   * 删除 Conversation（软删除）
   */
  async delete(conversationId: string, userId: string): Promise<boolean> {
    const db = await getDatabase();
    const collection = db.collection<Conversation>('conversations');
    
    const result = await collection.updateOne(
      { conversationId, userId },
      {
        $set: {
          isActive: false,
          updatedAt: new Date(),
        },
      }
    );

    return result.modifiedCount > 0;
  }
}

