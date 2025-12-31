/**
 * Message Entity - 消息实体
 * 
 * 职责：
 * - 封装消息的核心业务逻辑和数据
 * - 确保消息数据的一致性和完整性
 * - 提供业务方法（如内容更新）
 */

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// 定义消息属性的 Schema
const MessagePropsSchema = z.object({
  messageId: z.string().uuid(),
  clientMessageId: z.string().uuid().optional().nullable(),
  conversationId: z.string().uuid(),
  userId: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  contentPreview: z.string().optional().nullable(),
  contentLength: z.number().optional().nullable(),
  thinking: z.string().optional().nullable(),
  sources: z.array(z.object({
    title: z.string(),
    url: z.string()
  })).optional().nullable(),
  modelType: z.enum(['local', 'volcano']).optional().nullable(),
  timestamp: z.date(),
  metadata: z.object({
    tokens: z.number().optional(),
    duration: z.number().optional()
  }).optional().nullable(),
});

type MessageProps = z.infer<typeof MessagePropsSchema>;

/**
 * 消息实体类
 */
export class MessageEntity {
  private constructor(private props: MessageProps) {}

  /**
   * 创建新消息实体
   */
  static create(
    conversationId: string,
    userId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    clientMessageId?: string,
    modelType?: 'local' | 'volcano',
    thinking?: string,
    sources?: Array<{ title: string; url: string }>,
    metadata?: { tokens?: number; duration?: number }
  ): MessageEntity {
    const messageId = uuidv4();
    const timestamp = new Date();
    const contentPreview = content.substring(0, 1000);
    const contentLength = content.length;

    const messageProps: MessageProps = {
      messageId,
      clientMessageId: clientMessageId || null,
      conversationId,
      userId,
      role,
      content,
      contentPreview,
      contentLength,
      thinking: thinking || null,
      sources: sources || null,
      modelType: modelType || null,
      timestamp,
      metadata: metadata || null,
    };

    MessagePropsSchema.parse(messageProps); // 验证
    return new MessageEntity(messageProps);
  }

  /**
   * 从持久化数据重建消息实体
   */
  static fromPersistence(data: any): MessageEntity {
    const parsedProps = MessagePropsSchema.parse({
      ...data,
      messageId: data.messageId || data._id?.toString(),
      timestamp: data.timestamp instanceof Date ? data.timestamp : new Date(data.timestamp),
    });
    return new MessageEntity(parsedProps);
  }

  /**
   * 转换为持久化数据格式
   */
  toPersistence(): MessageProps {
    return { ...this.props };
  }

  // ==================== Getters ====================

  get messageId() { return this.props.messageId; }
  get clientMessageId() { return this.props.clientMessageId; }
  get conversationId() { return this.props.conversationId; }
  get userId() { return this.props.userId; }
  get role() { return this.props.role; }
  get content() { return this.props.content; }
  get contentPreview() { return this.props.contentPreview; }
  get contentLength() { return this.props.contentLength; }
  get thinking() { return this.props.thinking; }
  get sources() { return this.props.sources; }
  get modelType() { return this.props.modelType; }
  get timestamp() { return this.props.timestamp; }
  get metadata() { return this.props.metadata; }

  // ==================== 业务方法 ====================

  /**
   * 更新消息内容
   */
  updateContent(newContent: string): void {
    this.props.content = newContent;
    this.props.contentPreview = newContent.substring(0, 1000);
    this.props.contentLength = newContent.length;
    MessagePropsSchema.parse(this.props); // 重新验证
  }
}

