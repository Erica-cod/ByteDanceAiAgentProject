/**
 * Conversation Repository Interface
 * 应用层接口：定义数据访问契约，不依赖具体实现
 */

import { ConversationEntity } from '../../../domain/entities/conversation.entity.js';

/**
 * Conversation Repository 接口
 * 定义所有会话相关的数据操作
 */
export interface IConversationRepository {
  /**
   * 保存新的 Conversation
   */
  save(conversation: ConversationEntity): Promise<void>;

  /**
   * 根据 ID 查找 Conversation
   */
  findById(conversationId: string, userId: string): Promise<ConversationEntity | null>;

  /**
   * 查找用户的所有 Conversation（分页）
   */
  findByUserId(
    userId: string,
    limit: number,
    skip: number
  ): Promise<{
    conversations: ConversationEntity[];
    total: number;
  }>;

  /**
   * 更新 Conversation
   */
  update(conversation: ConversationEntity): Promise<void>;

  /**
   * 删除 Conversation（软删除）
   */
  delete(conversationId: string, userId: string): Promise<boolean>;

  /**
   * 归档 Conversation
   */
  archive(conversation: ConversationEntity): Promise<boolean>;

  /**
   * 取消归档 Conversation
   */
  unarchive(conversation: ConversationEntity): Promise<boolean>;

  /**
   * 查找用户的归档 Conversation（分页）
   */
  findArchivedByUserId(
    userId: string,
    limit: number,
    skip: number
  ): Promise<{
    conversations: ConversationEntity[];
    total: number;
  }>;

  /**
   * 根据 ID 查找归档的 Conversation
   */
  findArchivedById(conversationId: string, userId: string): Promise<ConversationEntity | null>;
}

