/**
 * 请求缓存实体
 * 
 * 用于缓存 AI 生成的内容，避免重复处理相同或相似的请求
 * 使用 embedding 向量进行相似度匹配
 */

export interface RequestCacheEntity {
  /**
   * 缓存ID（MongoDB _id）
   */
  cacheId: string;

  /**
   * 用户ID（用于隔离不同用户的缓存）
   */
  userId: string;

  /**
   * 请求内容（原始文本）
   */
  requestText: string;

  /**
   * 请求的 embedding 向量（768维，来自火山引擎）
   */
  requestEmbedding: number[];

  /**
   * AI 生成的响应内容
   */
  responseContent: string;

  /**
   * 响应的思考过程（可选，用于 thinking 模型）
   */
  responseThinking?: string;

  /**
   * 模型类型
   */
  modelType: 'local' | 'volcano';

  /**
   * 请求模式
   */
  mode?: 'single' | 'multi_agent' | 'chunking';

  /**
   * 命中次数（缓存被使用的次数）
   */
  hitCount: number;

  /**
   * 最后命中时间
   */
  lastHitAt?: Date;

  /**
   * 创建时间
   */
  createdAt: Date;

  /**
   * 过期时间（用于自动清理旧缓存）
   */
  expiresAt: Date;

  /**
   * 元数据（扩展字段）
   */
  metadata?: {
    /**
     * 原始请求的字符数
     */
    requestLength?: number;

    /**
     * 响应的字符数
     */
    responseLength?: number;

    /**
     * 处理耗时（毫秒）
     */
    processingTimeMs?: number;

    /**
     * 是否来自长文本分析
     */
    isLongText?: boolean;

    /**
     * 其他自定义字段
     */
    [key: string]: any;
  };
}

/**
 * 创建请求缓存实体的参数
 */
export interface CreateRequestCacheParams {
  userId: string;
  requestText: string;
  requestEmbedding: number[];
  responseContent: string;
  responseThinking?: string;
  modelType: 'local' | 'volcano';
  mode?: 'single' | 'multi_agent' | 'chunking';
  metadata?: RequestCacheEntity['metadata'];
  ttlDays?: number; // 缓存有效期（天），默认 30 天
}

/**
 * 创建请求缓存实体
 */
export function createRequestCache(params: CreateRequestCacheParams): Omit<RequestCacheEntity, 'cacheId'> {
  const now = new Date();
  const ttlDays = params.ttlDays || 30;
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

  return {
    userId: params.userId,
    requestText: params.requestText,
    requestEmbedding: params.requestEmbedding,
    responseContent: params.responseContent,
    responseThinking: params.responseThinking,
    modelType: params.modelType,
    mode: params.mode || 'single',
    hitCount: 0,
    createdAt: now,
    expiresAt,
    metadata: {
      requestLength: params.requestText.length,
      responseLength: params.responseContent.length,
      ...params.metadata,
    },
  };
}

