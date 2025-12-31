/**
 * Conversation Domain Entity
 * 领域实体：封装会话的业务逻辑和规则
 */

import { z } from 'zod';

/**
 * Conversation 验证 Schema
 */
const ConversationSchema = z.object({
  conversationId: z.string().uuid(),
  userId: z.string().min(1),
  title: z.string().min(1).max(200),
  createdAt: z.date(),
  updatedAt: z.date(),
  messageCount: z.number().int().min(0),
  isActive: z.boolean(),
});

/**
 * Conversation Entity
 */
export class ConversationEntity {
  private constructor(
    public readonly conversationId: string,
    public readonly userId: string,
    public title: string,
    public readonly createdAt: Date,
    public updatedAt: Date,
    public messageCount: number,
    public isActive: boolean
  ) {
    // 验证数据
    ConversationSchema.parse({
      conversationId,
      userId,
      title,
      createdAt,
      updatedAt,
      messageCount,
      isActive,
    });
  }

  /**
   * 创建新的 Conversation
   */
  static create(
    conversationId: string,
    userId: string,
    title?: string
  ): ConversationEntity {
    const now = new Date();
    return new ConversationEntity(
      conversationId,
      userId,
      title || 'New Conversation',
      now,
      now,
      0,
      true
    );
  }

  /**
   * 从数据库数据重建 Entity
   */
  static fromPersistence(data: {
    conversationId: string;
    userId: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    messageCount: number;
    isActive: boolean;
  }): ConversationEntity {
    return new ConversationEntity(
      data.conversationId,
      data.userId,
      data.title,
      data.createdAt,
      data.updatedAt,
      data.messageCount,
      data.isActive
    );
  }

  /**
   * 转换为持久化格式
   */
  toPersistence() {
    return {
      conversationId: this.conversationId,
      userId: this.userId,
      title: this.title,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      messageCount: this.messageCount,
      isActive: this.isActive,
    };
  }

  /**
   * 业务规则：更新标题
   */
  updateTitle(newTitle: string): void {
    if (!newTitle || newTitle.trim().length === 0) {
      throw new Error('Title cannot be empty');
    }
    if (newTitle.length > 200) {
      throw new Error('Title too long (max 200 characters)');
    }
    this.title = newTitle;
    this.updatedAt = new Date();
  }

  /**
   * 业务规则：增加消息计数
   */
  incrementMessageCount(): void {
    this.messageCount++;
    this.updatedAt = new Date();
  }

  /**
   * 业务规则：标记为不活跃（软删除）
   */
  markAsInactive(): void {
    this.isActive = false;
    this.updatedAt = new Date();
  }

  /**
   * 业务规则：是否属于指定用户
   */
  belongsTo(userId: string): boolean {
    return this.userId === userId;
  }
}

