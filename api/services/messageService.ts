import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { Message } from '../db/models.js';

export class MessageService {
  // 预览长度常量
  private static readonly PREVIEW_LENGTH = 1000;

  /**
   * 生成内容预览和长度信息
   */
  private static generatePreviewData(content: string): {
    contentPreview: string;
    contentLength: number;
  } {
    const contentLength = content.length;
    const contentPreview = contentLength > this.PREVIEW_LENGTH
      ? content.slice(0, this.PREVIEW_LENGTH)
      : content;
    
    return { contentPreview, contentLength };
  }

  /**
   * Add a message to conversation
   */
  static async addMessage(
    conversationId: string,
    userId: string,
    role: 'user' | 'assistant',
    content: string,
    clientMessageId?: string,
    thinking?: string,
    modelType?: 'local' | 'volcano',
    sources?: Array<{title: string; url: string}>
  ): Promise<Message> {
    const db = await getDatabase();
    const collection = db.collection<Message>('messages');

    // ✅ 生成预览数据
    const { contentPreview, contentLength } = this.generatePreviewData(content);

    // 如果带了 clientMessageId，就按 (conversationId, userId, clientMessageId) 做幂等写入
    // 目的：支持前端断线重连/重试，避免重复插入用户消息或 assistant 最终消息
    if (clientMessageId) {
      console.log('💾 MessageService.addMessage - 幂等保存消息:', {
        role,
        clientMessageId,
        hasSources: !!sources,
        sourcesCount: sources?.length || 0,
      });

      const now = new Date();
      const result = await collection.findOneAndUpdate(
        { conversationId, userId, clientMessageId },
        {
          $setOnInsert: {
            messageId: uuidv4(),
            clientMessageId,
            conversationId,
            userId,
            role,
            timestamp: now,
          },
          // 重试时允许覆盖内容（assistant 可能在重连后生成完整版本）
          $set: {
            content,
            contentPreview,
            contentLength,
            thinking,
            sources,
            modelType,
          },
        },
        { upsert: true, returnDocument: 'after' }
      );

      if (!result) {
        // 理论上不会发生；兜底用 insertOne
        const fallback: Message = {
          messageId: uuidv4(),
          clientMessageId,
          conversationId,
          userId,
          role,
          content,
          contentPreview,
          contentLength,
          thinking,
          sources,
          modelType,
          timestamp: now,
        };
        await collection.insertOne(fallback);
        return fallback;
      }

      return result;
    }

    // 不带 clientMessageId：按旧逻辑直接插入
    const message: Message = {
      messageId: uuidv4(),
      conversationId,
      userId,
      role,
      content,
      contentPreview,
      contentLength,
      thinking,
      sources,
      modelType,
      timestamp: new Date(),
    };

    console.log('💾 MessageService.addMessage - 保存消息:', {
      role,
      contentLength,
      hasPreview: contentLength > this.PREVIEW_LENGTH,
      hasSources: !!sources,
      sourcesCount: sources?.length || 0,
    });

    await collection.insertOne(message);
    return message;
  }

  /**
   * Get conversation messages (with pagination)
   * @param preview - 如果为true,只返回contentPreview而不是完整content（性能优化）
   */
  static async getConversationMessages(
    conversationId: string,
    userId: string,
    limit: number = 500,  // 增加默认限制到 500 条消息
    skip: number = 0,
    preview: boolean = false  // ✅ 新增：是否只返回预览
  ): Promise<{ messages: Message[]; total: number }> {
    const db = await getDatabase();
    const collection = db.collection<Message>('messages');

    // ✅ 如果只需要预览，不查询完整 content 字段
    const projection = preview
      ? {
          messageId: 1,
          clientMessageId: 1,
          conversationId: 1,
          userId: 1,
          role: 1,
          contentPreview: 1,  // 只取预览
          contentLength: 1,   // 取长度信息
          thinking: 1,
          sources: 1,
          modelType: 1,
          timestamp: 1,
          metadata: 1,
          content: 0,  // 明确排除 content
        }
      : undefined;  // undefined表示查询所有字段

    const messages = await collection
      .find({ conversationId, userId }, preview ? { projection } : {})
      .sort({ timestamp: 1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    const total = await collection.countDocuments({ conversationId, userId });

    // ✅ 如果是预览模式，将 contentPreview 映射到 content 字段
    const processedMessages = preview
      ? messages.map(msg => ({
          ...msg,
          content: msg.contentPreview || '',  // 预览内容作为 content
        }))
      : messages;

    console.log('📖 MessageService.getConversationMessages - 读取消息:', {
      count: processedMessages.length,
      previewMode: preview,
      messagesWithSources: processedMessages.filter(m => m.sources && m.sources.length > 0).length
    });
    
    // 打印每条有 sources 的消息
    processedMessages.forEach((msg, index) => {
      if (msg.sources && msg.sources.length > 0) {
        console.log(`📎 消息 ${index + 1} 有 sources:`, msg.sources.length, '条');
      }
    });

    return { messages: processedMessages, total };
  }

  /**
   * Get message by ID (with user verification)
   */
  static async getMessage(messageId: string, userId: string): Promise<Message | null> {
    const db = await getDatabase();
    const collection = db.collection<Message>('messages');
    
    return await collection.findOne({ messageId, userId });
  }

  /**
   * Delete all messages in a conversation
   */
  static async deleteConversationMessages(conversationId: string, userId: string): Promise<number> {
    const db = await getDatabase();
    const collection = db.collection<Message>('messages');

    const result = await collection.deleteMany({ conversationId, userId });
    return result.deletedCount || 0;
  }

  /**
   * Get user's total message count
   */
  static async getUserMessageCount(userId: string): Promise<number> {
    const db = await getDatabase();
    const collection = db.collection<Message>('messages');
    
    return await collection.countDocuments({ userId });
  }

  /**
   * 获取消息内容的指定范围（渐进式加载）
   * @param messageId 消息ID
   * @param userId 用户ID
   * @param start 起始位置（字符索引）
   * @param length 要获取的长度
   * @returns 内容片段及元数据
   */
  static async getMessageContentRange(
    messageId: string,
    userId: string,
    start: number,
    length: number
  ): Promise<{
    content: string;
    start: number;
    length: number;
    total: number;
    hasMore: boolean;
  } | null> {
    const db = await getDatabase();
    const collection = db.collection<Message>('messages');

    // 查询完整消息
    const message = await collection.findOne(
      { messageId, userId },
      { projection: { content: 1, contentLength: 1 } }
    );

    if (!message) {
      return null;
    }

    const fullContent = message.content || '';
    const totalLength = message.contentLength || fullContent.length;

    // 提取指定范围的内容
    const end = Math.min(start + length, fullContent.length);
    const contentSlice = fullContent.slice(start, end);
    const actualLength = contentSlice.length;
    const hasMore = end < fullContent.length;

    console.log(`📖 MessageService.getMessageContentRange - 分段读取:`, {
      messageId,
      start,
      requestedLength: length,
      actualLength,
      totalLength,
      hasMore,
    });

    return {
      content: contentSlice,
      start,
      length: actualLength,
      total: totalLength,
      hasMore,
    };
  }
}

