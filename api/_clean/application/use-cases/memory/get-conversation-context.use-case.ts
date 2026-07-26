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
import { compressContext } from '../../../infrastructure/llm/context-compressor.js';

export interface GetConversationContextInput {
  conversationId: string;
  userId: string;
  currentMessage: string;
  systemPrompt: string;
  config?: Partial<MemoryConfig>;
  /** 是否启用上下文压缩（默认对远程模型启用） */
  enableCompression?: boolean;
}

export interface GetConversationContextOutput {
  context: ChatMessage[];
  stats: {
    totalMessages: number;
    recentMessages: number;
    relevantMessages: number;
    uniqueMessages: number;
    estimatedTokens: number;
    retrievalMode: 'hybrid' | 'keyword' | 'recent_only';
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

    // 步骤 2: 混合召回；不可用或无结果时降级为关键词匹配
    let relevantMessages: typeof recentMessages = [];
    let retrievalMode: GetConversationContextOutput['stats']['retrievalMode'] =
      'recent_only';
    const recentIds = new Set(recentMessages.map(message => message.messageId));

    if (
      memoryEntity.config.enableHybridRetrieval &&
      this.memoryRepository.findHybridRelevantMessages
    ) {
      relevantMessages =
        await this.memoryRepository.findHybridRelevantMessages({
          conversationId,
          userId,
          query: currentMessage,
          excludeMessageIds: recentIds,
          limit: memoryEntity.config.hybridMatchCount,
          lexicalCandidateCount: memoryEntity.config.lexicalCandidateCount,
          vectorCandidateCount: memoryEntity.config.vectorCandidateCount,
          recencyHalfLifeDays: memoryEntity.config.recencyHalfLifeDays,
          weights: {
            relevance: memoryEntity.config.relevanceWeight,
            recency: memoryEntity.config.recencyWeight,
            importance: memoryEntity.config.importanceWeight,
          },
        });
      if (relevantMessages.length > 0) {
        retrievalMode = 'hybrid';
        console.log(
          `🔎 通过混合召回找到 ${relevantMessages.length} 条相关历史消息`
        );
      }
    }

    if (
      relevantMessages.length === 0 &&
      memoryEntity.config.enableKeywordMatch &&
      recentMessages.length > 0
    ) {
      const keywords = ConversationMemoryEntity.extractKeywords(currentMessage);
      
      if (keywords.length > 0) {
        relevantMessages = await this.memoryRepository.findRelevantMessages(
          conversationId,
          userId,
          keywords,
          recentIds,
          memoryEntity.config.keywordMatchCount
        );
        
        if (relevantMessages.length > 0) {
          retrievalMode = 'keyword';
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
    let context = memoryWithMessages.buildContext(currentMessage, systemPrompt);

    // 步骤 3.5: 可选 - 上下文压缩（将早期历史摘要化，降低远程模型 token 消耗）
    const shouldCompress = input.enableCompression !== false && context.length > 8;
    if (shouldCompress) {
      console.log('📦 [GetConversationContext] 启用上下文压缩...');
      const systemMsg = context[0]; // system prompt
      const currentMsg = context[context.length - 1]; // 当前用户消息
      const historyMsgs = context.slice(1, -1); // 中间的历史消息

      const compressed = await compressContext(historyMsgs, 4, conversationId);
      context = [systemMsg, ...compressed, currentMsg];
      console.log(`📦 [GetConversationContext] 压缩后上下文: ${context.length} 条消息`);
    }

    // 步骤 4: 获取统计信息
    const stats = memoryWithMessages.getStats();
    const estimatedTokens = this.estimateTokens(context);

    console.log(`📝 最终上下文包含 ${context.length} 条消息，预估 ${estimatedTokens} tokens`);

    return {
      context,
      stats: {
        ...stats,
        estimatedTokens,
        retrievalMode,
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

