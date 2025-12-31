/**
 * 记忆仓储接口
 * 
 * 定义对话记忆的数据访问方法
 */

import { HistoricalMessage, MemoryConfig } from '../../../domain/entities/conversation-memory.entity.js';

/**
 * 记忆仓储接口
 */
export interface IMemoryRepository {
  /**
   * 获取最近的消息（滑动窗口）
   * 
   * @param conversationId - 对话 ID
   * @param userId - 用户 ID
   * @param limit - 获取数量限制
   * @returns 最近的消息列表
   */
  getRecentMessages(
    conversationId: string,
    userId: string,
    limit: number
  ): Promise<HistoricalMessage[]>;

  /**
   * 查找相关消息（关键词匹配）
   * 
   * @param conversationId - 对话 ID
   * @param userId - 用户 ID
   * @param keywords - 关键词列表
   * @param excludeMessageIds - 要排除的消息 ID 列表
   * @param limit - 获取数量限制
   * @returns 相关消息列表（按相关性分数排序）
   */
  findRelevantMessages(
    conversationId: string,
    userId: string,
    keywords: string[],
    excludeMessageIds: Set<string>,
    limit: number
  ): Promise<HistoricalMessage[]>;

  /**
   * 获取对话的总消息数
   * 
   * @param conversationId - 对话 ID
   * @param userId - 用户 ID
   * @returns 总消息数
   */
  getTotalMessageCount(
    conversationId: string,
    userId: string
  ): Promise<number>;
}

