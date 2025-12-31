/**
 * ⚠️ DEPRECATED - 已迁移到 Clean Architecture
 * 
 * 请使用新的 Use Cases 代替：
 * - SaveSessionUseCase (api/_clean/application/use-cases/agent-session/save-session.use-case.ts)
 * - LoadSessionUseCase (api/_clean/application/use-cases/agent-session/load-session.use-case.ts)
 * - DeleteSessionUseCase (api/_clean/application/use-cases/agent-session/delete-session.use-case.ts)
 * - CleanExpiredSessionsUseCase (api/_clean/application/use-cases/agent-session/clean-expired-sessions.use-case.ts)
 * - GetSessionStatsUseCase (api/_clean/application/use-cases/agent-session/get-session-stats.use-case.ts)
 * 
 * 获取方式：
 * ```typescript
 * import { getContainer } from '../_clean/di-container.js';
 * const container = getContainer();
 * const saveSessionUseCase = container.getSaveSessionUseCase();
 * ```
 * 
 * ---
 * 
 * 多 Agent 会话状态管理服务（MongoDB 实现）
 * 
 * 为什么用 MongoDB 而不是 Redis：
 * 1. 低频操作：每个会话只保存5次（每轮一次），MongoDB性能完全够用
 * 2. 持久化需求：断点续传需要可靠的持久化，MongoDB原生支持
 * 3. 查询能力：可能需要按conversationId查询历史会话，MongoDB支持
 * 4. 数据规模可预测：最多200并发 × 10KB = 2MB，不需要Redis的极致性能
 * 5. 架构一致性：其他数据都在MongoDB，统一管理更简单
 * 
 * 性能分析：
 * - 写入频率：200并发 × 5轮 / (5轮 × 30秒) ≈ 6.7次/秒
 * - MongoDB能力：数千次/秒
 * - 富余量：300倍
 * - 延迟占比：10ms / 30秒 = 0.03%（可忽略）
 * 
 * 详见：docs/ARCHITECTURE_DECISION.md
 */

import { getDatabase } from '../db/connection.js';
import type { MultiAgentSession } from '../db/models.js';

/**
 * 多 Agent 会话服务
 */
export class MultiAgentSessionService {
  /**
   * 保存多 Agent 会话状态
   * 
   * @param conversationId 对话ID
   * @param userId 用户ID
   * @param assistantMessageId 助手消息ID（客户端生成）
   * @param state 会话状态
   * @returns 是否保存成功
   */
  static async saveState(
    conversationId: string,
    userId: string,
    assistantMessageId: string,
    state: {
      completedRounds: number;
      sessionState: any;
      userQuery: string;
    }
  ): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      const db = await getDatabase();
      const collection = db.collection<MultiAgentSession>('multi_agent_sessions');
      
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5分钟后过期
      
      const sessionId = `${conversationId}:${assistantMessageId}`;
      
      // 使用 upsert 实现幂等保存
      await collection.findOneAndUpdate(
        { sessionId, conversationId, userId, assistantMessageId },
        {
          $set: {
            completedRounds: state.completedRounds,
            sessionState: state.sessionState,
            userQuery: state.userQuery,
            updatedAt: now,
            expiresAt: expiresAt,
          },
          $setOnInsert: {
            sessionId,
            conversationId,
            userId,
            assistantMessageId,
            createdAt: now,
          },
        },
        { upsert: true }
      );
      
      const elapsed = Date.now() - startTime;
      console.log(
        `💾 [MongoDB] 已保存多 Agent 状态: ${sessionId} (第 ${state.completedRounds} 轮, 耗时 ${elapsed}ms)`
      );
      
      return true;
    } catch (error) {
      console.error('❌ [MongoDB] 保存多 Agent 状态失败:', error);
      return false;
    }
  }

  /**
   * 加载多 Agent 会话状态
   * 
   * @param conversationId 对话ID
   * @param userId 用户ID
   * @param assistantMessageId 助手消息ID
   * @returns 会话状态（如果存在且未过期）
   */
  static async loadState(
    conversationId: string,
    userId: string,
    assistantMessageId: string
  ): Promise<{
    completedRounds: number;
    sessionState: any;
    userQuery: string;
    updatedAt: Date;
  } | null> {
    const startTime = Date.now();
    
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
      
      const elapsed = Date.now() - startTime;
      
      if (!session) {
        console.log(`📭 [MongoDB] 未找到缓存状态: ${sessionId} (耗时 ${elapsed}ms)`);
        return null;
      }
      
      console.log(
        `📦 [MongoDB] 已恢复多 Agent 状态: ${sessionId} (第 ${session.completedRounds} 轮, 耗时 ${elapsed}ms)`
      );
      
      return {
        completedRounds: session.completedRounds,
        sessionState: session.sessionState,
        userQuery: session.userQuery,
        updatedAt: session.updatedAt,
      };
    } catch (error) {
      console.error('❌ [MongoDB] 恢复多 Agent 状态失败:', error);
      return null;
    }
  }

  /**
   * 删除多 Agent 会话状态（完成或取消时）
   * 
   * @param conversationId 对话ID
   * @param userId 用户ID
   * @param assistantMessageId 助手消息ID
   * @returns 是否删除成功
   */
  static async deleteState(
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
      
      console.log(`🗑️  [MongoDB] 已删除多 Agent 状态: ${sessionId}`);
      return true;
    } catch (error) {
      console.error('❌ [MongoDB] 删除多 Agent 状态失败:', error);
      return false;
    }
  }

  /**
   * 清理过期的会话（定时任务可调用）
   * 
   * 注意：MongoDB TTL索引会自动清理过期数据，这个方法是备用的
   * 
   * @returns 清理的数量
   */
  static async cleanExpired(): Promise<number> {
    try {
      const db = await getDatabase();
      const collection = db.collection<MultiAgentSession>('multi_agent_sessions');
      
      const result = await collection.deleteMany({
        expiresAt: { $lt: new Date() },
      });
      
      if (result.deletedCount > 0) {
        console.log(`🧹 [MongoDB] 清理了 ${result.deletedCount} 个过期的多 Agent 会话`);
      }
      
      return result.deletedCount;
    } catch (error) {
      console.error('❌ [MongoDB] 清理过期会话失败:', error);
      return 0;
    }
  }

  /**
   * 获取会话统计信息（用于监控）
   * 
   * @returns 统计信息
   */
  static async getStats(): Promise<{
    total: number;
    byRound: Record<number, number>;
  }> {
    try {
      const db = await getDatabase();
      const collection = db.collection<MultiAgentSession>('multi_agent_sessions');
      
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
      console.error('❌ [MongoDB] 获取统计信息失败:', error);
      return { total: 0, byRound: {} };
    }
  }

  /**
   * 创建 TTL 索引（初始化时调用一次）
   * 
   * MongoDB会根据expiresAt字段自动删除过期文档
   */
  static async ensureTTLIndex(): Promise<void> {
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
      
      console.log('✅ [MongoDB] TTL索引和查询索引已创建');
    } catch (error: any) {
      // 索引已存在时会报错，忽略
      if (error.code !== 85 && error.code !== 11000) {
        console.error('❌ [MongoDB] 创建索引失败:', error);
      }
    }
  }
}

