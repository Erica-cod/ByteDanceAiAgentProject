/**
 * Agent Session Repository 接口
 * 
 * 定义多 Agent 会话数据访问的抽象接口
 */

import type { AgentSessionEntity } from '../../../domain/entities/agent-session.entity.js';

export interface IAgentSessionRepository {
  /**
   * 保存会话状态（创建或更新）
   * 
   * @param session Agent 会话实体
   * @returns 是否保存成功
   */
  save(session: AgentSessionEntity): Promise<boolean>;

  /**
   * 根据会话标识查找会话（只返回未过期的）
   * 
   * @param conversationId 对话ID
   * @param userId 用户ID
   * @param assistantMessageId 助手消息ID
   * @returns Agent 会话实体（如果存在且未过期）
   */
  findByIdentifiers(
    conversationId: string,
    userId: string,
    assistantMessageId: string
  ): Promise<AgentSessionEntity | null>;

  /**
   * 删除会话
   * 
   * @param conversationId 对话ID
   * @param userId 用户ID
   * @param assistantMessageId 助手消息ID
   * @returns 是否删除成功
   */
  delete(
    conversationId: string,
    userId: string,
    assistantMessageId: string
  ): Promise<boolean>;

  /**
   * 清理过期的会话
   * 
   * @returns 清理的数量
   */
  cleanExpired(): Promise<number>;

  /**
   * 获取会话统计信息
   * 
   * @returns 统计信息
   */
  getStats(): Promise<{
    total: number;
    byRound: Record<number, number>;
  }>;

  /**
   * 确保 TTL 索引存在（初始化时调用）
   */
  ensureTTLIndex(): Promise<void>;
}

