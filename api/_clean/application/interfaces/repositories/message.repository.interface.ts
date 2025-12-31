/**
 * Message Repository Interface - 消息仓储接口
 * 
 * 职责：
 * - 定义消息数据访问的契约
 * - 确保 Domain 层不依赖具体的数据访问实现
 */

import { MessageEntity } from '../../../domain/entities/message.entity.js';

export interface IMessageRepository {
  /**
   * 保存新消息
   */
  save(message: MessageEntity): Promise<void>;

  /**
   * 根据 messageId 查找消息
   */
  findById(messageId: string, userId: string): Promise<MessageEntity | null>;

  /**
   * 根据 conversationId 查找消息列表
   */
  findByConversationId(
    conversationId: string,
    userId: string,
    limit: number,
    skip: number
  ): Promise<{ messages: MessageEntity[]; total: number }>;

  /**
   * 更新消息
   */
  update(message: MessageEntity): Promise<void>;

  /**
   * 删除消息
   */
  delete(messageId: string, userId: string): Promise<boolean>;

  /**
   * 删除对话的所有消息
   */
  deleteByConversationId(conversationId: string, userId: string): Promise<number>;
}

