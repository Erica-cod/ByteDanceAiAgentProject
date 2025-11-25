/**
 * 对话记忆管理服务
 * 
 * ==========================================
 * 📌 阶段 1: 滑动窗口 + 关键词匹配（当前实现）
 * ==========================================
 * 
 * 实现策略：
 * 1. 滑动窗口：保留最近 N 轮对话
 * 2. Token 限制：动态截断以适应模型上下文窗口
 * 3. 关键词匹配：简单的文本相似度查找
 * 
 * ==========================================
 * 📌 阶段 2: 向量检索记忆（明天实现）
 * ==========================================
 * 
 * 计划功能：
 * - Ollama Embeddings 生成向量
 * - FAISS 本地向量存储
 * - 语义相似度检索
 * - 跨对话检索能力
 */

import { MessageService } from './messageService.js';
import { Message } from '../db/models.js';

/**
 * 对话消息格式（用于模型）
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 记忆配置
 */
export interface MemoryConfig {
  // 滑动窗口大小（保留最近几轮对话）
  windowSize: number;
  
  // 最大 token 数限制（粗略估计：1 token ≈ 4 个字符）
  maxTokens: number;
  
  // 是否启用关键词匹配增强
  enableKeywordMatch: boolean;
  
  // 关键词匹配时额外检索的消息数
  keywordMatchCount: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: MemoryConfig = {
  windowSize: 10,        // 保留最近 10 轮对话（20 条消息）
  maxTokens: 4000,       // 最大 4000 tokens（约 16000 字符）
  enableKeywordMatch: true,
  keywordMatchCount: 3,  // 额外检索 3 条相关消息
};

/**
 * ==========================================
 * 阶段 1 实现：滑动窗口记忆管理
 * ==========================================
 */
export class ConversationMemoryService {
  private config: MemoryConfig;

  constructor(config?: Partial<MemoryConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 获取对话上下文（核心方法）
   * 
   * @param conversationId - 对话 ID
   * @param userId - 用户 ID
   * @param currentMessage - 当前用户消息
   * @param systemPrompt - 系统提示词
   * @returns 构建好的消息历史（包含系统提示词 + 历史 + 当前消息）
   */
  async getConversationContext(
    conversationId: string,
    userId: string,
    currentMessage: string,
    systemPrompt: string
  ): Promise<ChatMessage[]> {
    console.log('🧠 ConversationMemoryService - 开始构建对话上下文');
    console.log(`📊 配置: 窗口大小=${this.config.windowSize}, Token限制=${this.config.maxTokens}`);

    // 步骤 1: 获取最近的对话历史（滑动窗口）
    const recentMessages = await this.getRecentMessages(conversationId, userId);
    console.log(`✅ 获取到 ${recentMessages.length} 条最近消息`);

    // 步骤 2: 可选 - 关键词匹配增强（查找更早但相关的对话）
    let enhancedMessages = recentMessages;
    if (this.config.enableKeywordMatch && recentMessages.length > 0) {
      const relevantMessages = await this.findRelevantMessages(
        conversationId,
        userId,
        currentMessage,
        recentMessages
      );
      
      if (relevantMessages.length > 0) {
        console.log(`🔍 通过关键词匹配找到 ${relevantMessages.length} 条相关历史消息`);
        enhancedMessages = this.mergeMessages(relevantMessages, recentMessages);
      }
    }

    // 步骤 3: 转换为 ChatMessage 格式
    const historyMessages = this.convertToChatMessages(enhancedMessages);

    // 步骤 4: 构建完整上下文（系统提示词 + 历史 + 当前消息）
    const fullContext: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: currentMessage },
    ];

    // 步骤 5: Token 限制截断
    const truncatedContext = this.truncateByTokens(fullContext, systemPrompt);
    
    console.log(`📝 最终上下文包含 ${truncatedContext.length} 条消息`);
    console.log(`📊 预估 token 数: ${this.estimateTokens(truncatedContext)}`);

    return truncatedContext;
  }

  /**
   * 步骤 1: 获取最近的消息（滑动窗口）
   */
  private async getRecentMessages(
    conversationId: string,
    userId: string
  ): Promise<Message[]> {
    // 获取最近 N 轮对话（N*2 条消息，因为一轮包括用户+助手）
    const limit = this.config.windowSize * 2;
    
    const { messages } = await MessageService.getConversationMessages(
      conversationId,
      userId,
      limit,
      0 // 不跳过
    );

    // 按时间排序（确保从旧到新）
    return messages.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  /**
   * 步骤 2: 关键词匹配查找相关消息
   * 
   * 简单实现：基于关键词重叠度
   * （阶段 2 将替换为向量语义检索）
   */
  private async findRelevantMessages(
    conversationId: string,
    userId: string,
    query: string,
    recentMessages: Message[]
  ): Promise<Message[]> {
    // 获取更多历史消息用于搜索
    const { messages: allMessages } = await MessageService.getConversationMessages(
      conversationId,
      userId,
      100, // 搜索范围：最近 100 条
      0
    );

    // 排除已经在最近消息中的
    const recentIds = new Set(recentMessages.map(m => m.messageId));
    const searchableMessages = allMessages.filter(m => !recentIds.has(m.messageId));

    if (searchableMessages.length === 0) {
      return [];
    }

    // 提取查询关键词（简单分词）
    const queryKeywords = this.extractKeywords(query);
    
    if (queryKeywords.length === 0) {
      return [];
    }

    // 计算每条消息的相关性分数
    const scored = searchableMessages.map(msg => ({
      message: msg,
      score: this.calculateKeywordScore(msg.content, queryKeywords)
    }));

    // 按分数排序，取前 N 条
    const relevant = scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.keywordMatchCount)
      .map(item => item.message);

    return relevant;
  }

  /**
   * 提取关键词（简单实现）
   */
  private extractKeywords(text: string): string[] {
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
  private calculateKeywordScore(content: string, keywords: string[]): number {
    const contentLower = content.toLowerCase();
    let score = 0;

    for (const keyword of keywords) {
      // 完整匹配：+2 分
      if (contentLower.includes(keyword)) {
        score += 2;
      }
      // 部分匹配：+1 分
      else if (contentLower.split('').some(c => keyword.includes(c))) {
        score += 0.5;
      }
    }

    return score;
  }

  /**
   * 合并相关消息和最近消息（去重 + 排序）
   */
  private mergeMessages(relevantMessages: Message[], recentMessages: Message[]): Message[] {
    const allMessages = [...relevantMessages, ...recentMessages];
    
    // 去重（按 messageId）
    const uniqueMap = new Map<string, Message>();
    allMessages.forEach(msg => {
      uniqueMap.set(msg.messageId, msg);
    });

    // 按时间排序
    return Array.from(uniqueMap.values()).sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  /**
   * 步骤 3: 转换为 ChatMessage 格式
   */
  private convertToChatMessages(messages: Message[]): ChatMessage[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * 步骤 4: Token 限制截断
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
   * 获取记忆统计信息（用于调试）
   */
  async getMemoryStats(conversationId: string, userId: string) {
    const { total } = await MessageService.getConversationMessages(
      conversationId,
      userId,
      1,
      0
    );

    return {
      totalMessages: total,
      windowSize: this.config.windowSize,
      maxTokens: this.config.maxTokens,
      effectiveMessages: Math.min(total, this.config.windowSize * 2),
    };
  }
}

/**
 * ==========================================
 * 阶段 2 实现占位符（明天实现）
 * ==========================================
 * 
 * export class VectorMemoryService extends ConversationMemoryService {
 *   // 向量化存储
 *   async addMessageToVectorStore(message: Message): Promise<void>
 *   
 *   // 语义检索
 *   async semanticSearch(query: string, k: number): Promise<Message[]>
 *   
 *   // 混合检索（关键词 + 语义）
 *   async hybridSearch(query: string): Promise<Message[]>
 * }
 */

