/**
 * 可插拔工具系统 V2 - 类型定义
 */

/**
 * JSON Schema 类型（简化版）
 */
export interface JSONSchema {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
  items?: JSONSchema;
  enum?: any[];
  default?: any;
  description?: string;
}

/**
 * 工具元数据
 */
export interface ToolMetadata {
  /** 工具唯一名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 版本号 */
  version: string;
  /** 作者 */
  author: string;
  /** 标签（用于分类） */
  tags?: string[];
  /** 是否启用 */
  enabled?: boolean;
}

/**
 * Function Calling Schema（OpenAI 格式）
 */
export interface FunctionSchema {
  /** 函数名 */
  name: string;
  /** 函数描述 */
  description: string;
  /** 参数定义 */
  parameters: JSONSchema;
}

/**
 * 限流配置
 */
export interface RateLimitConfig {
  /** 最大并发数 */
  maxConcurrent: number;
  /** 每分钟最大请求数 */
  maxPerMinute: number;
  /** 超时时间（毫秒） */
  timeout: number;
}

/**
 * 缓存配置
 */
export interface CacheConfig {
  /** 是否启用缓存 */
  enabled: boolean;
  /** 缓存有效期（秒） */
  ttl: number;
  /** 缓存键生成策略 */
  keyStrategy?: 'params' | 'user' | 'custom';
  /** 自定义缓存键生成函数 */
  keyGenerator?: (params: any, context: ToolContext) => string;
}

/**
 * 熔断器配置
 */
export interface CircuitBreakerConfig {
  /** 是否启用熔断器 */
  enabled: boolean;
  /** 失败阈值（连续失败多少次触发熔断） */
  failureThreshold: number;
  /** 熔断重置超时（毫秒） */
  resetTimeout: number;
  /** 半开状态下的测试请求数 */
  halfOpenRequests?: number;
}

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 是否启用重试 */
  enabled: boolean;
  /** 最大重试次数 */
  maxAttempts: number;
  /** 重试间隔（毫秒） */
  delay: number;
  /** 重试策略 */
  strategy?: 'fixed' | 'exponential' | 'linear';
  /** 可重试的错误类型 */
  retryableErrors?: string[];
}

/**
 * 降级策略类型
 */
export type FallbackStrategyType = 'cache' | 'stale-cache' | 'fallback-tool' | 'simplified' | 'default';

/**
 * 降级策略配置
 */
export interface FallbackStrategy {
  /** 策略类型 */
  type: FallbackStrategyType;
  /** 策略配置（根据类型不同而不同） */
  config?: any;
}

/**
 * 降级配置（参考 Netflix Hystrix）
 */
export interface FallbackConfig {
  /** 是否启用降级 */
  enabled: boolean;
  
  /** 降级策略链（按顺序尝试，参考 Hystrix Fallback Chain） */
  fallbackChain: FallbackStrategy[];
  
  /** 备用工具名称（用于 fallback-tool 策略） */
  fallbackTool?: string;
  
  /** 简化参数（用于 simplified 策略，降级时使用更少资源） */
  simplifiedParams?: Record<string, any>;
  
  /** 默认响应（用于 default 策略，兜底方案） */
  defaultResponse?: ToolResult;
  
  /** 降级超时（毫秒，快速失败） */
  fallbackTimeout?: number;
  
  /** 是否允许返回过期缓存（用于 stale-cache 策略） */
  allowStaleCache?: boolean;
}

/**
 * 工具执行上下文
 */
export interface ToolContext {
  /** 用户 ID */
  userId: string;
  /** 会话 ID */
  conversationId?: string;
  /** 请求 ID（用于追踪） */
  requestId: string;
  /** 请求时间戳 */
  timestamp: number;
  /** 用户元数据 */
  userMeta?: Record<string, any>;
  /** 额外的上下文数据 */
  extra?: Record<string, any>;
}

/**
 * 工具执行结果
 */
export interface ToolResult {
  /** 是否成功 */
  success: boolean;
  /** 结果数据 */
  data?: any;
  /** 错误信息 */
  error?: string;
  /** 友好的消息（给用户看） */
  message?: string;
  /** 来源链接（如搜索结果） */
  sources?: Array<{ title: string; url: string }>;
  /** 执行耗时（毫秒） */
  duration?: number;
  /** 是否来自缓存 */
  fromCache?: boolean;
  /** 是否为降级响应 */
  degraded?: boolean;
  /** 降级策略类型（如果是降级响应） */
  degradedBy?: FallbackStrategyType;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误信息 */
  errors?: string[];
  /** 警告信息 */
  warnings?: string[];
}

/**
 * 工具插件接口
 */
export interface ToolPlugin {
  /** 工具元数据 */
  metadata: ToolMetadata;
  
  /** Function Calling Schema */
  schema: FunctionSchema;
  
  /** 限流配置（可选） */
  rateLimit?: RateLimitConfig;
  
  /** 缓存配置（可选） */
  cache?: CacheConfig;
  
  /** 熔断器配置（可选） */
  circuitBreaker?: CircuitBreakerConfig;
  
  /** 重试配置（可选） */
  retry?: RetryConfig;
  
  /** 降级配置（可选，参考 Netflix Hystrix） */
  fallback?: FallbackConfig;
  
  /**
   * 工具执行函数
   * @param params 参数（从 Function Calling 解析出来的）
   * @param context 执行上下文
   * @returns 执行结果
   */
  execute: (params: any, context: ToolContext) => Promise<ToolResult>;
  
  /**
   * 参数验证函数（可选）
   * @param params 参数
   * @returns 验证结果
   */
  validate?: (params: any) => ValidationResult | Promise<ValidationResult>;
  
  /**
   * 初始化函数（可选）
   * 在工具注册时调用，可用于初始化资源
   */
  onInit?: () => void | Promise<void>;
  
  /**
   * 销毁函数（可选）
   * 在工具卸载时调用，可用于清理资源
   */
  onDestroy?: () => void | Promise<void>;
}

/**
 * 工具执行选项
 */
export interface ExecuteOptions {
  /** 是否跳过缓存 */
  skipCache?: boolean;
  /** 是否跳过限流检查 */
  skipRateLimit?: boolean;
  /** 超时时间覆盖（毫秒） */
  timeout?: number;
  /** 重试次数覆盖 */
  retryAttempts?: number;
}

/**
 * 工具状态
 */
export type ToolStatus = 'healthy' | 'degraded' | 'unavailable' | 'disabled';

/**
 * 工具指标
 */
export interface ToolMetrics {
  /** 工具名 */
  name: string;
  /** 状态 */
  status: ToolStatus;
  /** 当前并发数 / 最大并发数 */
  concurrent: string;
  /** 每分钟请求数 / 限制 */
  perMinute: string;
  /** 利用率 */
  utilizationRate: string;
  /** 缓存命中率 */
  cacheHitRate: string;
  /** 平均延迟（毫秒） */
  averageLatency: number;
  /** 错误率 */
  errorRate: string;
  /** 熔断器状态 */
  circuitBreakerState?: 'closed' | 'open' | 'half-open';
  /** 总调用次数 */
  totalCalls: number;
  /** 成功次数 */
  successCalls: number;
  /** 失败次数 */
  failedCalls: number;
}

/**
 * 工具编排计划
 */
export interface ToolOrchestrationPlan {
  /** 步骤列表 */
  steps: ToolStep[];
  /** 计划 ID */
  planId: string;
  /** 创建时间 */
  createdAt: number;
}

/**
 * 工具步骤
 */
export interface ToolStep {
  /** 步骤 ID */
  stepId: string;
  /** 工具名 */
  toolName: string;
  /** 参数 */
  params: any;
  /** 依赖的步骤（需要等待这些步骤完成） */
  dependsOn?: string[];
  /** 失败时的行为 */
  onFailure?: 'abort' | 'continue' | 'retry';
  /** 描述 */
  description?: string;
}

/**
 * 工具编排结果
 */
export interface OrchestrationResult {
  /** 是否成功 */
  success: boolean;
  /** 计划 ID */
  planId: string;
  /** 各步骤的结果 */
  stepResults: Record<string, ToolResult>;
  /** 总耗时（毫秒） */
  totalDuration: number;
  /** 错误信息 */
  error?: string;
}

