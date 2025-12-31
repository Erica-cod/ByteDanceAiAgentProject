/**
 * 对话记忆实体
 * 
 * 封装对话记忆的业务规则和数据
 * 
 * 功能：
 * - 滑动窗口记忆管理
 * - Token 限制截断
 * - 关键词匹配增强
 */

import { z } from 'zod';

/**
 * 聊天消息格式（用于模型）
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 记忆配置 Schema
 */
const MemoryConfigSchema = z.object({
  // 滑动窗口大小（保留最近几轮对话）
  windowSize: z.number().int().positive().default(10),
  
  // 最大 token 数限制（粗略估计：1 token ≈ 4 个字符）
  maxTokens: z.number().int().positive().default(4000),
  
  // 是否启用关键词匹配增强
  enableKeywordMatch: z.boolean().default(true),
  
  // 关键词匹配时额外检索的消息数
  keywordMatchCount: z.number().int().positive().default(3),
});

export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;

/**
 * 历史消息数据
 */
export interface HistoricalMessage {
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/**
 * 对话记忆实体
 */
export class ConversationMemoryEntity {
  private constructor(
    public readonly conversationId: string,
    public readonly userId: string,
    public readonly config: MemoryConfig,
    public readonly recentMessages: HistoricalMessage[],
    public readonly relevantMessages: HistoricalMessage[]
  ) {}

  /**
   * 创建对话记忆实体
   */
  static create(
    conversationId: string,
    userId: string,
    config?: Partial<MemoryConfig>
  ): ConversationMemoryEntity {
    const validatedConfig = MemoryConfigSchema.parse(config || {});
    
    return new ConversationMemoryEntity(
      conversationId,
      userId,
      validatedConfig,
      [],
      []
    );
  }

  /**
   * 从已有数据重建实体
   */
  static fromData(
    conversationId: string,
    userId: string,
    config: MemoryConfig,
    recentMessages: HistoricalMessage[],
    relevantMessages: HistoricalMessage[]
  ): ConversationMemoryEntity {
    return new ConversationMemoryEntity(
      conversationId,
      userId,
      config,
      recentMessages,
      relevantMessages
    );
  }

  /**
   * 构建对话上下文
   * 
   * @param currentMessage - 当前用户消息
   * @param systemPrompt - 系统提示词
   * @returns 完整的对话上下文
   */
  buildContext(currentMessage: string, systemPrompt: string): ChatMessage[] {
    console.log('🧠 ConversationMemory - 开始构建对话上下文');
    console.log(`📊 配置: 窗口大小=${this.config.windowSize}, Token限制=${this.config.maxTokens}`);

    // 合并相关消息和最近消息
    const allHistoricalMessages = this.mergeAndSortMessages();
    console.log(`✅ 合并后共 ${allHistoricalMessages.length} 条历史消息`);

    // 转换为 ChatMessage 格式
    const historyMessages = this.convertToChatMessages(allHistoricalMessages);

    // 构建完整上下文
    const fullContext: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: currentMessage },
    ];

    // Token 限制截断
    const truncatedContext = this.truncateByTokens(fullContext, systemPrompt);
    
    console.log(`📝 最终上下文包含 ${truncatedContext.length} 条消息`);
    console.log(`📊 预估 token 数: ${this.estimateTokens(truncatedContext)}`);

    return truncatedContext;
  }

  /**
   * 合并并排序消息（去重）
   */
  private mergeAndSortMessages(): HistoricalMessage[] {
    const allMessages = [...this.relevantMessages, ...this.recentMessages];
    
    // 去重（按 messageId）
    const uniqueMap = new Map<string, HistoricalMessage>();
    allMessages.forEach(msg => {
      uniqueMap.set(msg.messageId, msg);
    });

    // 按时间排序（从旧到新）
    return Array.from(uniqueMap.values()).sort((a, b) =>
      a.timestamp.getTime() - b.timestamp.getTime()
    );
  }

  /**
   * 转换为 ChatMessage 格式
   */
  private convertToChatMessages(messages: HistoricalMessage[]): ChatMessage[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Token 限制截断
   * 
   * 策略：保留系统提示词 + 当前消息，从历史中间开始截断
   */
  private truncateByTokens(messages: ChatMessage[], systemPrompt: string): ChatMessage[] {
    const totalTokens = this.estimateTokens(messages);

    if (totalTokens <= this.config.maxTokens) {
      return messages; // 不需要截断
    }

    console.log(`⚠️ Token 超限 (${totalTokens} > ${this.config.maxTokens})，开始截断...`);

    // 保留系统提示词和当前消息（最后一条）
    const systemMsg = messages[0];
    const currentMsg = messages[messages.length - 1];
    const historyMessages = messages.slice(1, -1);

    // 预留系统提示词和当前消息的 token
    const reservedTokens = this.estimateTokens([systemMsg, currentMsg]);
    const availableTokens = this.config.maxTokens - reservedTokens;

    // 从历史消息中选择尽可能多的消息（优先保留最近的）
    const truncatedHistory: ChatMessage[] = [];
    let currentTokens = 0;

    // 从后往前遍历（优先保留最近的）
    for (let i = historyMessages.length - 1; i >= 0; i--) {
      const msgTokens = this.estimateTokens([historyMessages[i]]);
      
      if (currentTokens + msgTokens <= availableTokens) {
        truncatedHistory.unshift(historyMessages[i]); // 插入到前面保持顺序
        currentTokens += msgTokens;
      } else {
        break; // 超出限制，停止
      }
    }

    console.log(`✂️ 截断后保留 ${truncatedHistory.length} 条历史消息`);

    return [systemMsg, ...truncatedHistory, currentMsg];
  }

  /**
   * 粗略估计 token 数量
   * 
   * 规则：1 token ≈ 4 个字符（英文）或 2 个字符（中文）
   * 这是一个简化估计，实际应使用 tiktoken 库
   */
  private estimateTokens(messages: ChatMessage[]): number {
    const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    
    // 简化估计：平均 3 个字符 = 1 token
    return Math.ceil(totalChars / 3);
  }

  /**
   * 提取关键词（简单实现）
   */
  static extractKeywords(text: string): string[] {
    // 转小写，分词，过滤停用词
    const words = text.toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ') // 保留中英文
      .split(/\s+/)
      .filter(w => w.length > 1); // 过滤单字符

    // 简单的停用词列表
    const stopWords = new Set(['the', 'is', 'at', 'which', 'on', '的', '了', '是', '在', '我', '你', '他', '她', '它', '吗', '呢', '啊']);
    
    return words.filter(w => !stopWords.has(w));
  }

  /**
   * 计算关键词匹配分数
   */
  static calculateKeywordScore(content: string, keywords: string[]): number {
    const contentLower = content.toLowerCase();
    let score = 0;

    for (const keyword of keywords) {
      // 完整匹配：+2 分
      if (contentLower.includes(keyword)) {
        score += 2;
      }
      // 部分匹配：+0.5 分
      else if (contentLower.split('').some(c => keyword.includes(c))) {
        score += 0.5;
      }
    }

    return score;
  }

  /**
   * 获取记忆统计信息
   */
  getStats() {
    const totalMessages = this.recentMessages.length + this.relevantMessages.length;
    const uniqueMessages = this.mergeAndSortMessages().length;

    return {
      conversationId: this.conversationId,
      userId: this.userId,
      totalMessages,
      uniqueMessages,
      recentMessages: this.recentMessages.length,
      relevantMessages: this.relevantMessages.length,
      config: this.config,
    };
  }
}

