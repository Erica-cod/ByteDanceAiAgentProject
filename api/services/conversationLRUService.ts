/**
 * Conversation LRU Service - 对话 LRU 管理服务
 * 
 * 职责：
 * 1. 归档长期未访问的对话（软删除）
 * 2. 清理超出配额的归档对话
 * 3. 触发式清理：当用户对话数超限时主动清理
 * 4. 定期清理任务
 */

import { getDatabase } from '../db/connection.js';
import { getLRUConfig } from '../config/lruConfig.js';
import type { Conversation } from '../db/models.js';

export class ConversationLRUService {
  private config = getLRUConfig();

  /**
   * 更新对话的最后访问时间（调用此方法标记对话被使用）
   */
  async touchConversation(conversationId: string, userId: string): Promise<void> {
    try {
      const db = await getDatabase();
      await db.collection<Conversation>('conversations').updateOne(
        { conversationId, userId },
        {
          $set: {
            lastAccessedAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );
    } catch (error) {
      console.error('❌ 更新对话访问时间失败:', error);
    }
  }

  /**
   * 触发式归档：当用户活跃对话数超限时，归档最旧的对话
   * 
   * @returns 归档的对话数量
   */
  async archiveExcessConversationsForUser(userId: string): Promise<number> {
    try {
      const db = await getDatabase();
      const collection = db.collection<Conversation>('conversations');

      // 统计活跃对话数
      const activeCount = await collection.countDocuments({
        userId,
        isActive: true,
        isArchived: { $ne: true },
      });

      const maxActive = this.config.mongodb.maxActiveConversationsPerUser;
      if (activeCount <= maxActive) {
        return 0; // 未超限，不需要清理
      }

      // 超限：归档最旧的对话
      const excessCount = activeCount - maxActive;
      const toArchive = await collection
        .find({
          userId,
          isActive: true,
          isArchived: { $ne: true },
        })
        .sort({ lastAccessedAt: 1, updatedAt: 1 }) // 最久未访问的排前面
        .limit(excessCount)
        .toArray();

      if (toArchive.length === 0) return 0;

      // 批量归档
      const conversationIds = toArchive.map((c) => c.conversationId);
      await collection.updateMany(
        { conversationId: { $in: conversationIds }, userId },
        {
          $set: {
            isArchived: true,
            archivedAt: new Date(),
            isActive: false, // 归档后标记为不活跃
          },
        }
      );

      console.log(`✅ 用户 ${userId} 归档了 ${conversationIds.length} 个对话`);
      return conversationIds.length;
    } catch (error) {
      console.error('❌ 触发式归档失败:', error);
      return 0;
    }
  }

  /**
   * 定期清理任务：归档所有用户长期未访问的对话
   * 
   * @returns 统计信息
   */
  async autoArchiveInactiveConversations(): Promise<{
    archivedCount: number;
    affectedUsers: number;
  }> {
    try {
      const db = await getDatabase();
      const collection = db.collection<Conversation>('conversations');

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.mongodb.autoArchiveAfterDays);

      // 查找长期未访问的对话
      const result = await collection.updateMany(
        {
          isActive: true,
          isArchived: { $ne: true },
          $or: [
            { lastAccessedAt: { $lt: cutoffDate } },
            { 
              lastAccessedAt: { $exists: false },
              updatedAt: { $lt: cutoffDate }
            },
          ],
        },
        {
          $set: {
            isArchived: true,
            archivedAt: new Date(),
            isActive: false,
          },
        }
      );

      console.log(`✅ 自动归档了 ${result.modifiedCount} 个超过 ${this.config.mongodb.autoArchiveAfterDays} 天未访问的对话`);

      // 统计影响的用户数（可选）
      const affectedConversations = await collection
        .find({ isArchived: true, archivedAt: { $gte: new Date(Date.now() - 60000) } })
        .toArray();
      const affectedUsers = new Set(affectedConversations.map((c) => c.userId)).size;

      return {
        archivedCount: result.modifiedCount,
        affectedUsers,
      };
    } catch (error) {
      console.error('❌ 自动归档失败:', error);
      return { archivedCount: 0, affectedUsers: 0 };
    }
  }

  /**
   * 清理超出配额的归档对话（为每个用户保留最新的 N 个归档）
   * 
   * @returns 清理的对话数量
   */
  async cleanupExcessArchivedConversations(): Promise<number> {
    try {
      const db = await getDatabase();
      const collection = db.collection<Conversation>('conversations');

      // 找出所有有归档对话的用户
      const usersWithArchived = await collection.distinct('userId', {
        isArchived: true,
      });

      let totalDeleted = 0;

      for (const userId of usersWithArchived) {
        // 统计该用户的归档对话数
        const archivedCount = await collection.countDocuments({
          userId,
          isArchived: true,
        });

        const maxArchived = this.config.mongodb.maxArchivedConversationsPerUser;
        if (archivedCount <= maxArchived) {
          continue; // 未超限
        }

        // 超限：删除最旧的归档对话
        const excessCount = archivedCount - maxArchived;
        const toDelete = await collection
          .find({ userId, isArchived: true })
          .sort({ archivedAt: 1, updatedAt: 1 }) // 最早归档的排前面
          .limit(excessCount)
          .toArray();

        if (toDelete.length > 0) {
          const conversationIds = toDelete.map((c) => c.conversationId);
          
          // 删除对话及其消息
          await this.deleteConversationsAndMessages(conversationIds, userId);
          totalDeleted += conversationIds.length;
        }
      }

      console.log(`✅ 清理了 ${totalDeleted} 个超出配额的归档对话`);
      return totalDeleted;
    } catch (error) {
      console.error('❌ 清理归档对话失败:', error);
      return 0;
    }
  }

  /**
   * 删除过期的归档对话（归档时间超过配置的天数）
   * 
   * @returns 删除的对话数量
   */
  async deleteExpiredArchivedConversations(): Promise<number> {
    try {
      const { deleteArchivedAfterDays } = this.config.mongodb;
      if (deleteArchivedAfterDays === 0) {
        return 0; // 永不删除归档
      }

      const db = await getDatabase();
      const collection = db.collection<Conversation>('conversations');

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - deleteArchivedAfterDays);

      // 查找过期的归档对话
      const expiredConversations = await collection
        .find({
          isArchived: true,
          archivedAt: { $lt: cutoffDate },
        })
        .toArray();

      if (expiredConversations.length === 0) return 0;

      const conversationIds = expiredConversations.map((c) => c.conversationId);
      
      // 按用户分组删除（保证 userId 匹配）
      const userGroups = expiredConversations.reduce((acc, c) => {
        if (!acc[c.userId]) acc[c.userId] = [];
        acc[c.userId].push(c.conversationId);
        return acc;
      }, {} as Record<string, string[]>);

      let totalDeleted = 0;
      for (const [userId, ids] of Object.entries(userGroups)) {
        await this.deleteConversationsAndMessages(ids, userId);
        totalDeleted += ids.length;
      }

      console.log(`✅ 删除了 ${totalDeleted} 个过期归档对话（归档 ${deleteArchivedAfterDays} 天后）`);
      return totalDeleted;
    } catch (error) {
      console.error('❌ 删除过期归档对话失败:', error);
      return 0;
    }
  }

  /**
   * 彻底删除对话及其所有消息
   */
  private async deleteConversationsAndMessages(
    conversationIds: string[],
    userId: string
  ): Promise<void> {
    const db = await getDatabase();

    // 删除消息
    await db.collection('messages').deleteMany({
      conversationId: { $in: conversationIds },
      userId,
    });

    // 删除对话
    await db.collection<Conversation>('conversations').deleteMany({
      conversationId: { $in: conversationIds },
      userId,
    });
  }

  /**
   * 恢复归档的对话
   */
  async restoreArchivedConversation(
    conversationId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const db = await getDatabase();
      const result = await db.collection<Conversation>('conversations').updateOne(
        { conversationId, userId, isArchived: true },
        {
          $set: {
            isArchived: false,
            isActive: true,
            lastAccessedAt: new Date(),
            updatedAt: new Date(),
          },
          $unset: {
            archivedAt: '',
          },
        }
      );

      if (result.modifiedCount > 0) {
        console.log(`✅ 恢复归档对话: ${conversationId}`);
        
        // 恢复后检查是否超限，触发归档其他旧对话
        await this.archiveExcessConversationsForUser(userId);
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ 恢复归档对话失败:', error);
      return false;
    }
  }

  /**
   * 执行完整的清理流程（定期任务调用）
   */
  async runFullCleanup(): Promise<{
    archived: number;
    deletedExpired: number;
    deletedExcess: number;
  }> {
    console.log('🧹 开始执行 LRU 清理任务...');

    // 1. 归档长期未访问的对话
    const { archivedCount } = await this.autoArchiveInactiveConversations();

    // 2. 删除过期的归档对话
    const deletedExpired = await this.deleteExpiredArchivedConversations();

    // 3. 清理超出配额的归档对话
    const deletedExcess = await this.cleanupExcessArchivedConversations();

    console.log('✅ LRU 清理任务完成:', {
      archived: archivedCount,
      deletedExpired,
      deletedExcess,
    });

    return {
      archived: archivedCount,
      deletedExpired,
      deletedExcess,
    };
  }
}

// 导出单例
let lruServiceInstance: ConversationLRUService | null = null;

export function getConversationLRUService(): ConversationLRUService {
  if (!lruServiceInstance) {
    lruServiceInstance = new ConversationLRUService();
  }
  return lruServiceInstance;
}

