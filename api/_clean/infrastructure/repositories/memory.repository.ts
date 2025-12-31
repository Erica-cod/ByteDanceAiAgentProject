/**
 * 记忆仓储实现
 * 
 * 使用 MongoDB 直接访问消息数据
 */

import { connectToDatabase } from '../../../db/connection.js';
import type { Message } from '../../../db/models.js';
import { IMemoryRepository } from '../../application/interfaces/repositories/memory.repository.interface.js';
import { 
  HistoricalMessage,
  ConversationMemoryEntity 
} from '../../domain/entities/conversation-memory.entity.js';

/**
 * MongoDB 记忆仓储实现
 */
export class MongoMemoryRepository implements IMemoryRepository {
  /**
   * 获取最近的消息（滑动窗口）
   */
  async getRecentMessages(
    conversationId: string,
    userId: string,
    limit: number
  ): Promise<HistoricalMessage[]> {
    const db = await connectToDatabase();
    const messagesCollection = db.collection<Message>('messages');

    // 查询最近的消息
    const messages = await messagesCollection
      .find({
        conversationId,
        userId,
      })
      .sort({ timestamp: -1 }) // 按时间倒序
      .limit(limit)
      .toArray();

    // 转换为 HistoricalMessage 格式并按时间正序排列
    return messages
      .reverse() // 反转为正序（从旧到新）
      .map(msg => this.toHistoricalMessage(msg));
  }

  /**
   * 查找相关消息（关键词匹配）
   */
  async findRelevantMessages(
    conversationId: string,
    userId: string,
    keywords: string[],
    excludeMessageIds: Set<string>,
    limit: number
  ): Promise<HistoricalMessage[]> {
    const db = await connectToDatabase();
    const messagesCollection = db.collection<Message>('messages');

    // 查询更多历史消息用于搜索（排除已有的）
    const allMessages = await messagesCollection
      .find({
        conversationId,
        userId,
        messageId: { $nin: Array.from(excludeMessageIds) },
      })
      .sort({ timestamp: -1 })
      .limit(100) // 搜索范围：最近 100 条
      .toArray();

    if (allMessages.length === 0) {
      return [];
    }

    // 计算每条消息的相关性分数
    const scored = allMessages.map(msg => ({
      message: msg,
      score: ConversationMemoryEntity.calculateKeywordScore(msg.content, keywords)
    }));

    // 按分数排序，取前 N 条
    const relevant = scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => this.toHistoricalMessage(item.message));

    return relevant;
  }

  /**
   * 获取对话的总消息数
   */
  async getTotalMessageCount(
    conversationId: string,
    userId: string
  ): Promise<number> {
    const db = await connectToDatabase();
    const messagesCollection = db.collection<Message>('messages');

    return await messagesCollection.countDocuments({
      conversationId,
      userId,
    });
  }

  /**
   * 将 MongoDB Message 转换为 HistoricalMessage
   */
  private toHistoricalMessage(msg: Message): HistoricalMessage {
    return {
      messageId: msg.messageId,
      role: msg.role,
      content: msg.content,
      timestamp: new Date(msg.timestamp),
    };
  }
}

