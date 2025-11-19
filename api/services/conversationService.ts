import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { Conversation, Message } from '../db/models.js';

export class ConversationService {
  /**
   * Create a new conversation
   */
  static async createConversation(userId: string, title?: string): Promise<Conversation> {
    const db = getDatabase();
    const collection = db.collection<Conversation>('conversations');

    const conversation: Conversation = {
      conversationId: uuidv4(),
      userId,
      title: title || 'New Conversation',
      createdAt: new Date(),
      updatedAt: new Date(),
      messageCount: 0,
      isActive: true
    };

    await collection.insertOne(conversation);
    return conversation;
  }

  /**
   * Get user's conversations (with pagination)
   */
  static async getUserConversations(
    userId: string,
    limit: number = 20,
    skip: number = 0
  ): Promise<{ conversations: Conversation[]; total: number }> {
    const db = getDatabase();
    const collection = db.collection<Conversation>('conversations');

    const conversations = await collection
      .find({ userId, isActive: true })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    const total = await collection.countDocuments({ userId, isActive: true });

    return { conversations, total };
  }

  /**
   * Get conversation by ID (with user verification)
   */
  static async getConversation(conversationId: string, userId: string): Promise<Conversation | null> {
    const db = getDatabase();
    const collection = db.collection<Conversation>('conversations');
    
    return await collection.findOne({ conversationId, userId });
  }

  /**
   * Update conversation
   */
  static async updateConversation(
    conversationId: string,
    userId: string,
    updates: Partial<Conversation>
  ): Promise<boolean> {
    const db = getDatabase();
    const collection = db.collection<Conversation>('conversations');

    const result = await collection.updateOne(
      { conversationId, userId },
      { $set: { ...updates, updatedAt: new Date() } }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Delete conversation (soft delete)
   */
  static async deleteConversation(conversationId: string, userId: string): Promise<boolean> {
    const db = getDatabase();
    const collection = db.collection<Conversation>('conversations');

    const result = await collection.updateOne(
      { conversationId, userId },
      { $set: { isActive: false, updatedAt: new Date() } }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Increment message count
   */
  static async incrementMessageCount(conversationId: string, userId: string): Promise<void> {
    const db = getDatabase();
    const collection = db.collection<Conversation>('conversations');

    await collection.updateOne(
      { conversationId, userId },
      { 
        $inc: { messageCount: 1 },
        $set: { updatedAt: new Date() }
      }
    );
  }
}

