/**
 * MongoAgentSessionRepository - Agent Session Repository 的 MongoDB 实现
 * 
 * 负责 Agent 会话状态在 MongoDB 中的持久化
 */

import type { IAgentSessionRepository } from '../../application/interfaces/repositories/agent-session.repository.interface.js';
import { AgentSessionEntity } from '../../domain/entities/agent-session.entity.js';
import { getDatabase } from '../../../db/connection.js';
import type { MultiAgentSession } from '../../../db/models.js';

export class MongoAgentSessionRepository implements IAgentSessionRepository {
  /**
   * 保存会话状态（创建或更新）
   */
  async save(session: AgentSessionEntity): Promise<boolean> {
    try {
      const db = await getDatabase();
      const collection = db.collection<MultiAgentSession>('multi_agent_sessions');

      const data = session.toPersistence();

      // 使用 upsert 实现幂等保存
      await collection.findOneAndUpdate(
        {
          sessionId: data.sessionId,
          conversationId: data.conversationId,
          userId: data.userId,
          assistantMessageId: data.assistantMessageId,
        },
        {
          $set: {
            completedRounds: data.completedRounds,
            sessionState: data.sessionState,
            userQuery: data.userQuery,
            updatedAt: data.updatedAt,
            expiresAt: data.expiresAt,
          },
          $setOnInsert: {
            sessionId: data.sessionId,
            conversationId: data.conversationId,
            userId: data.userId,
            assistantMessageId: data.assistantMessageId,
            createdAt: data.createdAt,
          },
        },
        { upsert: true }
      );

      return true;
    } catch (error) {
      console.error('❌ [MongoAgentSessionRepository] 保存会话失败:', error);
      return false;
    }
  }

  /**
   * 根据会话标识查找会话（只返回未过期的）
   */
  async findByIdentifiers(
    conversationId: string,
    userId: string,
    assistantMessageId: string
  ): Promise<AgentSessionEntity | null> {
    try {
      const db = await getDatabase();
      const collection = db.collection<MultiAgentSession>('multi_agent_sessions');

      const sessionId = `${conversationId}:${assistantMessageId}`;

      // 查询未过期的会话
      const session = await collection.findOne({
        sessionId,
        conversationId,
        userId,
        assistantMessageId,
        expiresAt: { $gt: new Date() }, // 只查询未过期的
      });

      if (!session) {
        return null;
      }

      // 重建实体
      return AgentSessionEntity.fromPersistence({
        sessionId: session.sessionId,
        conversationId: session.conversationId,
        userId: session.userId,
        assistantMessageId: session.assistantMessageId,
        completedRounds: session.completedRounds,
        sessionState: session.sessionState,
        userQuery: session.userQuery,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      console.error('❌ [MongoAgentSessionRepository] 查找会话失败:', error);
      return null;
    }
  }

  /**
   * 删除会话
   */
  async delete(
    conversationId: string,
    userId: string,
    assistantMessageId: string
  ): Promise<boolean> {
    try {
      const db = await getDatabase();
      const collection = db.collection<MultiAgentSession>('multi_agent_sessions');

      const sessionId = `${conversationId}:${assistantMessageId}`;

      await collection.deleteOne({
        sessionId,
        conversationId,
        userId,
        assistantMessageId,
      });

      return true;
    } catch (error) {
      console.error('❌ [MongoAgentSessionRepository] 删除会话失败:', error);
      return false;
    }
  }

  /**
   * 清理过期的会话
   */
  async cleanExpired(): Promise<number> {
    try {
      const db = await getDatabase();
      const collection = db.collection<MultiAgentSession>('multi_agent_sessions');

      const result = await collection.deleteMany({
        expiresAt: { $lt: new Date() },
      });

      return result.deletedCount;
    } catch (error) {
      console.error('❌ [MongoAgentSessionRepository] 清理过期会话失败:', error);
      return 0;
    }
  }

  /**
   * 获取会话统计信息
   */
  async getStats(): Promise<{
    total: number;
    byRound: Record<number, number>;
  }> {
    try {
      const db = await getDatabase();
      const collection = db.collection<MultiAgentSession>('multi_agent_sessions');

      // 总数统计
      const total = await collection.countDocuments({
        expiresAt: { $gt: new Date() },
      });

      // 按轮次统计
      const pipeline = [
        { $match: { expiresAt: { $gt: new Date() } } },
        { $group: { _id: '$completedRounds', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ];

      const byRoundArray = await collection.aggregate(pipeline).toArray();
      const byRound: Record<number, number> = {};
      byRoundArray.forEach((item: any) => {
        byRound[item._id] = item.count;
      });

      return { total, byRound };
    } catch (error) {
      console.error('❌ [MongoAgentSessionRepository] 获取统计信息失败:', error);
      return { total: 0, byRound: {} };
    }
  }

  /**
   * 确保 TTL 索引存在（初始化时调用）
   */
  async ensureTTLIndex(): Promise<void> {
    try {
      const db = await getDatabase();
      const collection = db.collection<MultiAgentSession>('multi_agent_sessions');

      // 创建 TTL 索引（MongoDB会自动清理过期数据）
      await collection.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0, name: 'ttl_index' }
      );

      // 创建复合索引（提高查询性能）
      await collection.createIndex(
        { sessionId: 1, userId: 1 },
        { name: 'session_user_index' }
      );

      console.log('✅ [MongoAgentSessionRepository] TTL索引和查询索引已创建');
    } catch (error: any) {
      // 索引已存在时会报错，忽略
      if (error.code !== 85 && error.code !== 11000) {
        console.error('❌ [MongoAgentSessionRepository] 创建索引失败:', error);
      }
    }
  }
}

