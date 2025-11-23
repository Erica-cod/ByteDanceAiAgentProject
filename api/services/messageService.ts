import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { Message } from '../db/models.js';

export class MessageService {
  /**
   * Add a message to conversation
   */
  static async addMessage(
    conversationId: string,
    userId: string,
    role: 'user' | 'assistant',
    content: string,
    thinking?: string,
    modelType?: 'local' | 'volcano',
    sources?: Array<{title: string; url: string}>
  ): Promise<Message> {
    const db = await getDatabase();
    const collection = db.collection<Message>('messages');

    const message: Message = {
      messageId: uuidv4(),
      conversationId,
      userId,
      role,
      content,
      thinking,
      sources,
      modelType,
      timestamp: new Date()
    };

    console.log('💾 MessageService.addMessage - 保存消息:', {
      role,
      hasSources: !!sources,
      sourcesCount: sources?.length || 0,
      sources: sources
    });

    await collection.insertOne(message);
    
    console.log('✅ MessageService.addMessage - 消息已保存到数据库');
    
    return message;
  }

  /**
   * Get conversation messages (with pagination)
   */
  static async getConversationMessages(
    conversationId: string,
    userId: string,
    limit: number = 500,  // 增加默认限制到 500 条消息
    skip: number = 0
  ): Promise<{ messages: Message[]; total: number }> {
    const db = await getDatabase();
    const collection = db.collection<Message>('messages');

    const messages = await collection
      .find({ conversationId, userId })
      .sort({ timestamp: 1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    const total = await collection.countDocuments({ conversationId, userId });

    console.log('📖 MessageService.getConversationMessages - 读取消息:', {
      count: messages.length,
      messagesWithSources: messages.filter(m => m.sources && m.sources.length > 0).length
    });
    
    // 打印每条有 sources 的消息
    messages.forEach((msg, index) => {
      if (msg.sources && msg.sources.length > 0) {
        console.log(`📎 消息 ${index + 1} 有 sources:`, msg.sources.length, '条');
      }
    });

    return { messages, total };
  }

  /**
   * Get message by ID (with user verification)
   */
  static async getMessage(messageId: string, userId: string): Promise<Message | null> {
    const db = await getDatabase();
    const collection = db.collection<Message>('messages');
    
    return await collection.findOne({ messageId, userId });
  }

  /**
   * Delete all messages in a conversation
   */
  static async deleteConversationMessages(conversationId: string, userId: string): Promise<number> {
    const db = await getDatabase();
    const collection = db.collection<Message>('messages');

    const result = await collection.deleteMany({ conversationId, userId });
    return result.deletedCount || 0;
  }

  /**
   * Get user's total message count
   */
  static async getUserMessageCount(userId: string): Promise<number> {
    const db = await getDatabase();
    const collection = db.collection<Message>('messages');
    
    return await collection.countDocuments({ userId });
  }
}

