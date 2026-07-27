/**
 * 记忆仓储接口
 * 
 * 定义对话记忆的数据访问方法
 */

import { HistoricalMessage, MemoryConfig } from '../../../domain/entities/conversation-memory.entity.js';
import type { MemoryItem } from '../../../../db/models.js';

export interface HybridMemorySearchInput {
  conversationId: string;
  userId: string;
  query: string;
  excludeMessageIds: Set<string>;
  limit: number;
  lexicalCandidateCount: number;
  vectorCandidateCount: number;
  recencyHalfLifeDays: number;
  weights: {
    relevance: number;
    recency: number;
    importance: number;
  };
}

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
   * 混合召回：BM25/关键词 + 向量 + 时间/重要性重排。
   * 未配置 Atlas Search 或 Embedding 时由实现自动降级。
   */
  findHybridRelevantMessages?(
    input: HybridMemorySearchInput
  ): Promise<HistoricalMessage[]>;

  /**
   * 写入从原始消息派生出的记忆块。
   */
  replaceMemoryItemsForMessage?(
    messageId: string,
    userId: string,
    items: MemoryItem[]
  ): Promise<void>;

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

