import { Db } from 'mongodb';
import { IStreamProgressRepository } from '../../application/interfaces/repositories/stream-progress.repository.interface.js';
import { StreamProgress } from '../../domain/entities/stream-progress.entity.js';
import { getDatabase } from '../../../db/connection.js';

/**
 * MongoDB 实现的流式进度仓储
 */
export class StreamProgressRepository implements IStreamProgressRepository {
  private collectionName = 'stream_progress';

  /**
   * 获取集合
   */
  private async getCollection() {
    const db: Db = await getDatabase();
    return db.collection<StreamProgress>(this.collectionName);
  }

  /**
   * 创建或更新流式进度（upsert）
   */
  async upsert(progress: Partial<StreamProgress> & { messageId: string }): Promise<void> {
    const collection = await this.getCollection();

    await collection.updateOne(
      { messageId: progress.messageId },
      {
        $set: {
          ...progress,
          lastUpdateAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
          status: 'streaming',
          lastSentPosition: 0,
        },
      },
      { upsert: true }
    );
  }

  /**
   * 根据消息ID获取流式进度
   */
  async findByMessageId(messageId: string): Promise<StreamProgress | null> {
    const collection = await this.getCollection();
    return await collection.findOne({ messageId });
  }

  /**
   * 标记流式生成完成
   */
  async markCompleted(
    messageId: string,
    finalText: string,
    thinking?: string,
    sources?: Array<{ title: string; url: string }>
  ): Promise<void> {
    const collection = await this.getCollection();

    await collection.updateOne(
      { messageId },
      {
        $set: {
          accumulatedText: finalText,
          thinking,
          sources,
          status: 'completed',
          lastUpdateAt: new Date(),
        },
      }
    );
  }

  /**
   * 标记流式生成失败
   */
  async markError(messageId: string, error: string): Promise<void> {
    const collection = await this.getCollection();

    await collection.updateOne(
      { messageId },
      {
        $set: {
          status: 'error',
          error,
          lastUpdateAt: new Date(),
        },
      }
    );
  }

  /**
   * 删除流式进度记录
   */
  async delete(messageId: string): Promise<void> {
    const collection = await this.getCollection();
    await collection.deleteOne({ messageId });
  }

  /**
   * 确保索引存在
   */
  async ensureIndexes(): Promise<void> {
    const collection = await this.getCollection();

    // 消息ID索引（唯一）
    await collection.createIndex({ messageId: 1 }, { unique: true });

    // 用户ID索引
    await collection.createIndex({ userId: 1 });

    // 会话ID索引
    await collection.createIndex({ conversationId: 1 });

    // TTL 索引：30分钟后自动过期（防止垃圾数据累积）
    await collection.createIndex(
      { lastUpdateAt: 1 },
      { 
        expireAfterSeconds: 1800,  // 30分钟
        name: 'stream_progress_ttl'
      }
    );

    console.log('✅ StreamProgress 索引已创建');
  }
}

