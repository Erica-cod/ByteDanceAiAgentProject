/**
 * 对话记忆配置
 * 
 * ==========================================
 * 📌 阶段 1: 滑动窗口配置
 * ==========================================
 */

export interface MemoryConfig {
  // ============= 阶段 1 配置 =============
  
  /**
   * 滑动窗口大小（保留最近几轮对话）
   * 
   * 1 轮对话 = 1 条用户消息 + 1 条助手回复
   * 例如：windowSize = 10 表示保留最近 10 轮（20 条消息）
   * 
   * 建议值：
   * - 5-8: 短对话场景，快速响应
   * - 10-15: 标准对话场景（推荐）
   * - 20+: 长对话场景，需要更多上下文
   */
  windowSize: number;
  
  /**
   * 最大 Token 数限制
   * 
   * 用于防止上下文超出模型限制
   * Token 估算：约 1 token = 3-4 个字符
   * 
   * 建议值：
   * - 2000-4000: 一般场景（推荐）
   * - 6000-8000: 长上下文模型
   * - 注意：需根据模型上下文窗口调整
   */
  maxTokens: number;
  
  /**
   * 是否启用关键词匹配增强
   * 
   * 启用后，会搜索更早但相关的对话片段
   * 
   * 优点：可能找到相关的历史信息
   * 缺点：轻微增加计算时间
   */
  enableKeywordMatch: boolean;
  
  /**
   * 关键词匹配时额外检索的消息数
   * 
   * 仅在 enableKeywordMatch = true 时生效
   * 
   * 建议值：3-5
   */
  keywordMatchCount: number;

  // ============= 阶段 2 配置（预留）=============
  
  /**
   * 是否启用向量检索（阶段 2）
   * 
   * 启用后将使用语义相似度检索
   * 需要先实现 VectorMemoryService
   */
  enableVectorRetrieval?: boolean;
  
  /**
   * 向量检索数量（阶段 2）
   * 
   * 建议值：5-10
   */
  vectorRetrievalCount?: number;
  
  /**
   * Embedding 模型配置（阶段 2）
   */
  embeddingModel?: {
    provider: 'ollama' | 'openai' | 'local';
    model: string;
    apiUrl?: string;
  };
}

/**
 * 默认配置
 */
export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  // 阶段 1 配置
  windowSize: 10,
  maxTokens: 4000,
  enableKeywordMatch: true,
  keywordMatchCount: 3,
  
  // 阶段 2 配置（暂未实现）
  enableVectorRetrieval: false,
  vectorRetrievalCount: 5,
  embeddingModel: {
    provider: 'ollama',
    model: 'nomic-embed-text',
    apiUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
  },
};

/**
 * 根据模型类型获取推荐配置
 */
export function getRecommendedConfig(modelType: 'local' | 'volcano'): MemoryConfig {
  if (modelType === 'local') {
    // 本地模型通常资源有限，使用较小的窗口
    return {
      ...DEFAULT_MEMORY_CONFIG,
      windowSize: 8,
      maxTokens: 3000,
    };
  } else {
    // 云端模型可以使用更大的窗口
    return {
      ...DEFAULT_MEMORY_CONFIG,
      windowSize: 12,
      maxTokens: 6000,
    };
  }
}

/**
 * 从环境变量读取配置（可选）
 */
export function getConfigFromEnv(): Partial<MemoryConfig> {
  return {
    windowSize: process.env.MEMORY_WINDOW_SIZE 
      ? parseInt(process.env.MEMORY_WINDOW_SIZE) 
      : undefined,
    maxTokens: process.env.MEMORY_MAX_TOKENS 
      ? parseInt(process.env.MEMORY_MAX_TOKENS) 
      : undefined,
    enableKeywordMatch: process.env.MEMORY_ENABLE_KEYWORD_MATCH 
      ? process.env.MEMORY_ENABLE_KEYWORD_MATCH === 'true' 
      : undefined,
  };
}

