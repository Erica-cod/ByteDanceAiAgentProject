/**
 * MongoDB Message Repository Implementation - 消息仓储 MongoDB 实现
 * 
 * 职责：
 * - 实现 IMessageRepository 接口
 * - 处理消息数据在 MongoDB 中的存储和检索
 * - 在数据库和领域实体之间进行转换
 */

import { IMessageRepository } from '../../application/interfaces/repositories/message.repository.interface.js';
import { MessageEntity } from '../../domain/entities/message.entity.js';
import { getDatabase } from '../../../db/connection.js';

export class MessageRepository implements IMessageRepository {
  /**
   * 保存新消息
   */
  async save(message: MessageEntity): Promise<void> {
    const data = message.toPersistence();
    const db = await getDatabase();
    const collection = db.collection('messages');
    
    await collection.insertOne(data as any);
  }

  /**
   * 根据 messageId 查找消息
   */
  async findById(messageId: string, userId: string): Promise<MessageEntity | null> {
    const db = await getDatabase();
    const collection = db.collection('messages');
    const data = await collection.findOne({ messageId, userId });
    
    if (!data) {
      return null;
    }
    
    return MessageEntity.fromPersistence(data);
  }

  /**
   * 根据 conversationId 查找消息列表
   */
  async findByConversationId(
    conversationId: string,
    userId: string,
    limit: number,
    skip: number
  ): Promise<{ messages: MessageEntity[]; total: number }> {
    const db = await getDatabase();
    const collection = db.collection('messages');
    
    const messagesData = await collection
      .find({ conversationId, userId })
      .sort({ timestamp: 1 }) // 按时间升序
      .limit(limit)
      .skip(skip)
      .toArray();

    const total = await collection.countDocuments({ conversationId, userId });

    const messages = messagesData.map(data => MessageEntity.fromPersistence(data));
    return { messages, total };
  }

  /**
   * 更新消息
   */
  async update(message: MessageEntity): Promise<void> {
    const data = message.toPersistence();
    const db = await getDatabase();
    const collection = db.collection('messages');
    
    const result = await collection.updateOne(
      { messageId: data.messageId, userId: data.userId },
      { $set: data }
    );
    
    if (result.modifiedCount === 0 && result.matchedCount === 0) {
      throw new Error('Message not found or not updated');
    }
  }

  /**
   * 删除消息
   */
  async delete(messageId: string, userId: string): Promise<boolean> {
    const db = await getDatabase();
    const collection = db.collection('messages');
    const result = await collection.deleteOne({ messageId, userId });
    return result.deletedCount > 0;
  }

  /**
   * 删除对话的所有消息
   */
  async deleteByConversationId(conversationId: string, userId: string): Promise<number> {
    const db = await getDatabase();
    const collection = db.collection('messages');
    const result = await collection.deleteMany({ conversationId, userId });
    return result.deletedCount;
  }
}

