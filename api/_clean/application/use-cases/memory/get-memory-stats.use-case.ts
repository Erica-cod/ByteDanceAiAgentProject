/**
 * 获取记忆统计信息 Use Case
 * 
 * 用于调试和监控
 */

import { IMemoryRepository } from '../../interfaces/repositories/memory.repository.interface.js';
import { MemoryConfig } from '../../../domain/entities/conversation-memory.entity.js';

export interface GetMemoryStatsInput {
  conversationId: string;
  userId: string;
  config?: Partial<MemoryConfig>;
}

export interface GetMemoryStatsOutput {
  conversationId: string;
  userId: string;
  totalMessages: number;
  windowSize: number;
  maxTokens: number;
  effectiveMessages: number;
}

/**
 * 获取记忆统计信息 Use Case
 */
export class GetMemoryStatsUseCase {
  constructor(
    private readonly memoryRepository: IMemoryRepository
  ) {}

  async execute(input: GetMemoryStatsInput): Promise<GetMemoryStatsOutput> {
    const { conversationId, userId, config } = input;

    // 默认配置
    const windowSize = config?.windowSize ?? 10;
    const maxTokens = config?.maxTokens ?? 4000;

    // 获取总消息数
    const totalMessages = await this.memoryRepository.getTotalMessageCount(
      conversationId,
      userId
    );

    return {
      conversationId,
      userId,
      totalMessages,
      windowSize,
      maxTokens,
      effectiveMessages: Math.min(totalMessages, windowSize * 2),
    };
  }
}

