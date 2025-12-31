/**
 * 获取对话上下文 Use Case
 * 
 * 业务逻辑：
 * 1. 获取最近的消息（滑动窗口）
 * 2. 可选：查找相关历史消息（关键词匹配）
 * 3. 构建完整对话上下文（系统提示词 + 历史 + 当前消息）
 * 4. Token 限制截断
 */

import { IMemoryRepository } from '../../interfaces/repositories/memory.repository.interface.js';
import { 
  ConversationMemoryEntity, 
  MemoryConfig, 
  ChatMessage 
} from '../../../domain/entities/conversation-memory.entity.js';

export interface GetConversationContextInput {
  conversationId: string;
  userId: string;
  currentMessage: string;
  systemPrompt: string;
  config?: Partial<MemoryConfig>;
}

export interface GetConversationContextOutput {
  context: ChatMessage[];
  stats: {
    totalMessages: number;
    recentMessages: number;
    relevantMessages: number;
    uniqueMessages: number;
    estimatedTokens: number;
  };
}

/**
 * 获取对话上下文 Use Case
 */
export class GetConversationContextUseCase {
  constructor(
    private readonly memoryRepository: IMemoryRepository
  ) {}

  async execute(input: GetConversationContextInput): Promise<GetConversationContextOutput> {
    const {
      conversationId,
      userId,
      currentMessage,
      systemPrompt,
      config
    } = input;

    console.log('🧠 [GetConversationContext] 开始获取对话上下文');

    // 创建记忆实体（包含配置）
    const memoryEntity = ConversationMemoryEntity.create(
      conversationId,
      userId,
      config
    );

    // 步骤 1: 获取最近的消息（滑动窗口）
    const windowSize = memoryEntity.config.windowSize * 2; // 一轮包括用户+助手
    const recentMessages = await this.memoryRepository.getRecentMessages(
      conversationId,
      userId,
      windowSize
    );
    console.log(`✅ 获取到 ${recentMessages.length} 条最近消息`);

    // 步骤 2: 可选 - 关键词匹配增强
    let relevantMessages: typeof recentMessages = [];
    if (memoryEntity.config.enableKeywordMatch && recentMessages.length > 0) {
      const keywords = ConversationMemoryEntity.extractKeywords(currentMessage);
      
      if (keywords.length > 0) {
        const recentIds = new Set(recentMessages.map(m => m.messageId));
        relevantMessages = await this.memoryRepository.findRelevantMessages(
          conversationId,
          userId,
          keywords,
          recentIds,
          memoryEntity.config.keywordMatchCount
        );
        
        if (relevantMessages.length > 0) {
          console.log(`🔍 通过关键词匹配找到 ${relevantMessages.length} 条相关历史消息`);
        }
      }
    }

    // 重建实体（包含获取的消息）
    const memoryWithMessages = ConversationMemoryEntity.fromData(
      conversationId,
      userId,
      memoryEntity.config,
      recentMessages,
      relevantMessages
    );

    // 步骤 3: 构建对话上下文
    const context = memoryWithMessages.buildContext(currentMessage, systemPrompt);

    // 步骤 4: 获取统计信息
    const stats = memoryWithMessages.getStats();
    const estimatedTokens = this.estimateTokens(context);

    console.log(`📝 最终上下文包含 ${context.length} 条消息，预估 ${estimatedTokens} tokens`);

    return {
      context,
      stats: {
        ...stats,
        estimatedTokens,
      },
    };
  }

  /**
   * 估计 token 数量
   */
  private estimateTokens(messages: ChatMessage[]): number {
    const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    return Math.ceil(totalChars / 3);
  }
}

