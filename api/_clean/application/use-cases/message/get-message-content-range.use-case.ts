/**
 * GetMessageContentRangeUseCase - 获取消息内容片段
 * 
 * 职责：支持大消息的分段加载
 */

import type { IMessageRepository } from '../../interfaces/repositories/message.repository.interface.js';

export interface GetMessageContentRangeInput {
  messageId: string;
  userId: string;
  start: number;
  length: number;
}

export interface GetMessageContentRangeOutput {
  content: string;
  start: number;
  length: number;
  total: number;
  hasMore: boolean;
}

export class GetMessageContentRangeUseCase {
  constructor(private messageRepository: IMessageRepository) {}

  async execute(input: GetMessageContentRangeInput): Promise<GetMessageContentRangeOutput | null> {
    const { messageId, userId, start, length } = input;

    try {
      // 查找消息
      const message = await this.messageRepository.findById(messageId, userId);

      if (!message) {
        console.log(`⚠️  [GetMessageContentRange] Message not found: ${messageId}`);
        return null;
      }

      // 获取完整内容
      const fullContent = message.content;
      const totalLength = fullContent.length;

      // 计算实际读取长度
      const actualLength = Math.min(length, totalLength - start);

      // 截取内容片段
      const contentSlice = fullContent.substring(start, start + actualLength);

      // 判断是否还有更多内容
      const hasMore = start + actualLength < totalLength;

      console.log(`📖 [GetMessageContentRange] 分段读取:`, {
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
    } catch (error: any) {
      console.error(`❌ [GetMessageContentRange] Failed to get message content range:`, error);
      throw new Error(`Failed to get message content range: ${error.message}`);
    }
  }
}

