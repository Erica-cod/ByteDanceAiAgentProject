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
    modelType?: 'local' | 'volcano'
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
      modelType,
      timestamp: new Date()
    };

    await collection.insertOne(message);
    return message;
  }

  /**
   * Get conversation messages (with pagination)
   */
  static async getConversationMessages(
    conversationId: string,
    userId: string,
    limit: number = 50,
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

