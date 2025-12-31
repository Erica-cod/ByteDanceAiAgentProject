/**
 * Metrics Entity - 性能指标实体
 * 
 * 职责：
 * - 封装系统性能指标的核心业务逻辑和数据
 * - 管理各类指标的记录和统计
 * - 提供指标分析方法
 */

import { z } from 'zod';

// 定义指标属性的 Schema
const MetricsPropsSchema = z.object({
  // SSE 连接指标
  activeSSEConnections: z.number().int().nonnegative(),
  sseConnectionsTotal: z.number().int().nonnegative(),
  sseConnectionErrors: z.number().int().nonnegative(),
  
  // 数据库指标
  dbQueryCount: z.number().int().nonnegative(),
  dbQueryDuration: z.array(z.number().nonnegative()),
  dbErrors: z.number().int().nonnegative(),
  
  // LLM 指标
  llmRequestCount: z.number().int().nonnegative(),
  llmRequestDuration: z.array(z.number().nonnegative()),
  llmTokensUsed: z.number().int().nonnegative(),
  llmErrors: z.number().int().nonnegative(),
  
  // 工具调用指标
  toolCallCount: z.number().int().nonnegative(),
  toolCallErrors: z.number().int().nonnegative(),
  
  // 内存指标
  memoryUsage: z.object({
    rss: z.number(),
    heapTotal: z.number(),
    heapUsed: z.number(),
    external: z.number(),
    arrayBuffers: z.number(),
  }),
  
  // 启用标志
  isEnabled: z.boolean(),
});

type MetricsProps = z.infer<typeof MetricsPropsSchema>;

/**
 * 性能指标实体类
 */
export class MetricsEntity {
  private constructor(private props: MetricsProps) {}

  /**
   * 创建新指标实体
   */
  static create(isEnabled: boolean = true): MetricsEntity {
    const props: MetricsProps = {
      activeSSEConnections: 0,
      sseConnectionsTotal: 0,
      sseConnectionErrors: 0,
      dbQueryCount: 0,
      dbQueryDuration: [],
      dbErrors: 0,
      llmRequestCount: 0,
      llmRequestDuration: [],
      llmTokensUsed: 0,
      llmErrors: 0,
      toolCallCount: 0,
      toolCallErrors: 0,
      memoryUsage: process.memoryUsage(),
      isEnabled,
    };

    MetricsPropsSchema.parse(props); // 验证
    return new MetricsEntity(props);
  }

  /**
   * 转换为持久化数据格式
   */
  toPersistence(): MetricsProps {
    return { ...this.props };
  }

  // ==================== Getters ====================

  get activeSSEConnections() { return this.props.activeSSEConnections; }
  get sseConnectionsTotal() { return this.props.sseConnectionsTotal; }
  get sseConnectionErrors() { return this.props.sseConnectionErrors; }
  get dbQueryCount() { return this.props.dbQueryCount; }
  get dbQueryDuration() { return [...this.props.dbQueryDuration]; }
  get dbErrors() { return this.props.dbErrors; }
  get llmRequestCount() { return this.props.llmRequestCount; }
  get llmRequestDuration() { return [...this.props.llmRequestDuration]; }
  get llmTokensUsed() { return this.props.llmTokensUsed; }
  get llmErrors() { return this.props.llmErrors; }
  get toolCallCount() { return this.props.toolCallCount; }
  get toolCallErrors() { return this.props.toolCallErrors; }
  get memoryUsage() { return { ...this.props.memoryUsage }; }
  get isEnabled() { return this.props.isEnabled; }

  // ==================== 业务方法 ====================

  /**
   * 记录 SSE 连接
   */
  recordSSEConnection(): void {
    if (!this.props.isEnabled) return;
    this.props.activeSSEConnections++;
    this.props.sseConnectionsTotal++;
  }

  /**
   * 记录 SSE 断开连接
   */
  recordSSEDisconnection(): void {
    if (!this.props.isEnabled) return;
    this.props.activeSSEConnections = Math.max(0, this.props.activeSSEConnections - 1);
  }

  /**
   * 记录 SSE 错误
   */
  recordSSEError(): void {
    if (!this.props.isEnabled) return;
    this.props.sseConnectionErrors++;
  }

  /**
   * 记录数据库查询
   */
  recordDBQuery(durationMs: number): void {
    if (!this.props.isEnabled) return;
    this.props.dbQueryCount++;
    this.props.dbQueryDuration.push(durationMs);
    
    // 只保留最近1000条记录
    if (this.props.dbQueryDuration.length > 1000) {
      this.props.dbQueryDuration.shift();
    }
  }

  /**
   * 记录数据库错误
   */
  recordDBError(): void {
    if (!this.props.isEnabled) return;
    this.props.dbErrors++;
  }

  /**
   * 记录 LLM 请求
   */
  recordLLMRequest(durationMs: number, tokensUsed: number = 0): void {
    if (!this.props.isEnabled) return;
    this.props.llmRequestCount++;
    this.props.llmRequestDuration.push(durationMs);
    this.props.llmTokensUsed += tokensUsed;
    
    if (this.props.llmRequestDuration.length > 1000) {
      this.props.llmRequestDuration.shift();
    }
  }

  /**
   * 记录 LLM 错误
   */
  recordLLMError(): void {
    if (!this.props.isEnabled) return;
    this.props.llmErrors++;
  }

  /**
   * 记录工具调用
   */
  recordToolCall(): void {
    if (!this.props.isEnabled) return;
    this.props.toolCallCount++;
  }

  /**
   * 记录工具调用错误
   */
  recordToolCallError(): void {
    if (!this.props.isEnabled) return;
    this.props.toolCallErrors++;
  }

  /**
   * 更新内存使用信息
   */
  updateMemoryUsage(): void {
    this.props.memoryUsage = process.memoryUsage();
  }

  /**
   * 重置指标
   */
  reset(): void {
    this.props.activeSSEConnections = 0;
    this.props.sseConnectionsTotal = 0;
    this.props.sseConnectionErrors = 0;
    this.props.dbQueryCount = 0;
    this.props.dbQueryDuration = [];
    this.props.dbErrors = 0;
    this.props.llmRequestCount = 0;
    this.props.llmRequestDuration = [];
    this.props.llmTokensUsed = 0;
    this.props.llmErrors = 0;
    this.props.toolCallCount = 0;
    this.props.toolCallErrors = 0;
    this.updateMemoryUsage();
  }

  /**
   * 获取 SSE 错误率
   */
  getSSEErrorRate(): number {
    return this.props.sseConnectionsTotal > 0
      ? this.props.sseConnectionErrors / this.props.sseConnectionsTotal
      : 0;
  }

  /**
   * 获取数据库平均查询时间
   */
  getDBAvgTime(): number {
    return this.props.dbQueryDuration.length > 0
      ? this.props.dbQueryDuration.reduce((a, b) => a + b, 0) / this.props.dbQueryDuration.length
      : 0;
  }

  /**
   * 获取 LLM 平均请求时间
   */
  getLLMAvgTime(): number {
    return this.props.llmRequestDuration.length > 0
      ? this.props.llmRequestDuration.reduce((a, b) => a + b, 0) / this.props.llmRequestDuration.length
      : 0;
  }

  /**
   * 获取内存使用百分比
   */
  getMemoryUsagePercent(): number {
    const { heapUsed, heapTotal } = this.props.memoryUsage;
    return (heapUsed / heapTotal) * 100;
  }
}

