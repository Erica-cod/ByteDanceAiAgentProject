/**
 * LLM 请求队列管理器
 * 
 * 核心功能：
 * - 限制 LLM API 并发请求数（防止打爆 API）
 * - 控制每分钟请求频率（RPM 限制）
 * - 优先级队列（Host > Planner > Critic > Reporter）
 * - 超时控制和熔断保护
 * - 完整的监控指标
 * 
 * 使用场景：
 * - 多 Agent 协作时，4 个 Agent 同时请求 LLM
 * - 高并发场景（200-500 用户）
 * - 需要精确控制 API 调用频率
 * 
 * 设计参考：
 * - Bull Queue (Redis-based job queue)
 * - AWS SQS (Message queue service)
 * - Rate limiting algorithms
 */

import EventEmitter from 'events';

/**
 * 队列项配置
 */
interface QueueItemConfig {
  id: string;
  agentType?: 'planner' | 'critic' | 'host' | 'reporter' | 'single';
  userId: string;
  conversationId?: string;
  priority: number;
  timeout: number;
  createdAt: number;
  startedAt?: number;
}

/**
 * 队列项
 */
interface QueueItem extends QueueItemConfig {
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timeoutId?: NodeJS.Timeout;
}

/**
 * 队列统计
 */
interface QueueStats {
  // 队列状态
  queueLength: number;
  activeRequests: number;
  
  // 计数
  totalProcessed: number;
  totalSuccess: number;
  totalFailed: number;
  totalTimeout: number;
  
  // 性能指标
  averageWaitTime: number;     // 平均等待时间（ms）
  averageProcessTime: number;  // 平均处理时间（ms）
  p95WaitTime: number;
  p95ProcessTime: number;
  
  // 限流状态
  currentRPM: number;
  maxRPM: number;
  currentConcurrency: number;
  maxConcurrency: number;
  utilizationRate: string;     // 利用率
  
  // 时间统计
  lastProcessedAt?: number;
  uptime: number;
}

/**
 * Agent 类型优先级映射
 */
const AGENT_PRIORITY = {
  host: 100,      // Host 最高优先级（决策者）
  planner: 80,    // Planner 次优先级
  critic: 60,     // Critic 中等优先级
  reporter: 40,   // Reporter 较低优先级
  single: 50,     // 单 Agent 模式
};

/**
 * LLM 请求队列管理器
 */
export class LLMRequestQueue extends EventEmitter {
  private queue: QueueItem[] = [];
  private activeRequests: Map<string, QueueItem> = new Map();
  
  // 配置
  private maxConcurrent: number;
  private maxRPM: number;
  private defaultTimeout: number;
  
  // RPM 追踪（滑动窗口）
  private requestTimestamps: number[] = [];
  
  // 统计数据
  private stats = {
    totalProcessed: 0,
    totalSuccess: 0,
    totalFailed: 0,
    totalTimeout: 0,
    waitTimes: [] as number[],
    processTimes: [] as number[],
    startTime: Date.now(),
    lastProcessedAt: undefined as number | undefined,
  };
  
  // 状态标志
  private isProcessing = false;
  private isPaused = false;

  constructor(config?: {
    maxConcurrent?: number;
    maxRPM?: number;
    defaultTimeout?: number;
  }) {
    super();
    
    this.maxConcurrent = config?.maxConcurrent || 50;
    this.maxRPM = config?.maxRPM || 500;
    this.defaultTimeout = config?.defaultTimeout || 60000; // 60秒

    console.log('🚦 [LLMQueue] 初始化完成');
    console.log(`   最大并发: ${this.maxConcurrent}`);
    console.log(`   最大 RPM: ${this.maxRPM}`);
    console.log(`   默认超时: ${this.defaultTimeout}ms`);

    // 定期清理过期的时间戳（每分钟）
    setInterval(() => this.cleanupOldTimestamps(), 60000);
  }

  /**
   * 将请求加入队列
   */
  async enqueue<T>(
    execute: () => Promise<T>,
    config?: {
      agentType?: 'planner' | 'critic' | 'host' | 'reporter' | 'single';
      userId?: string;
      conversationId?: string;
      priority?: number;
      timeout?: number;
    }
  ): Promise<T> {
    const agentType = config?.agentType || 'single';
    const basePriority = AGENT_PRIORITY[agentType];
    const customPriority = config?.priority || 0;
    
    const item: QueueItem = {
      id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentType,
      userId: config?.userId || 'unknown',
      conversationId: config?.conversationId,
      priority: basePriority + customPriority,
      timeout: config?.timeout || this.defaultTimeout,
      createdAt: Date.now(),
      execute,
      resolve: null as any,
      reject: null as any,
    };

    // 创建 Promise
    const promise = new Promise<T>((resolve, reject) => {
      item.resolve = resolve;
      item.reject = reject;
    });

    // 加入队列
    this.queue.push(item);
    
    console.log(` [LLMQueue] 请求入队: ${item.id}`);
    console.log(`   Agent: ${item.agentType}`);
    console.log(`   优先级: ${item.priority}`);
    console.log(`   队列长度: ${this.queue.length}`);
    console.log(`   活跃请求: ${this.activeRequests.size}/${this.maxConcurrent}`);

    // 触发事件
    this.emit('enqueue', item);

    // 尝试处理队列
    this.processQueue();

    return promise;
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    // 防止重入
    if (this.isProcessing || this.isPaused) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        // 检查并发限制
        if (this.activeRequests.size >= this.maxConcurrent) {
          console.log(`  [LLMQueue] 达到并发上限: ${this.activeRequests.size}/${this.maxConcurrent}`);
          break;
        }

        // 检查 RPM 限制
        const currentRPM = this.getCurrentRPM();
        if (currentRPM >= this.maxRPM) {
          console.log(`  [LLMQueue] 达到 RPM 上限: ${currentRPM}/${this.maxRPM}`);
          
          // 等待一段时间后重试
          setTimeout(() => this.processQueue(), 1000);
          break;
        }

        // 按优先级排序（优先级高的在前）
        this.queue.sort((a, b) => b.priority - a.priority);

        // 取出队首
        const item = this.queue.shift();
        if (!item) break;

        // 计算等待时间
        const waitTime = Date.now() - item.createdAt;
        this.stats.waitTimes.push(waitTime);

        console.log(` [LLMQueue] 开始处理: ${item.id}`);
        console.log(`   等待时间: ${waitTime}ms`);

        // 开始处理
        this.processItem(item);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 处理单个队列项
   */
  private async processItem(item: QueueItem): Promise<void> {
    item.startedAt = Date.now();
    this.activeRequests.set(item.id, item);
    this.requestTimestamps.push(Date.now());

    // 设置超时
    item.timeoutId = setTimeout(() => {
      this.handleTimeout(item);
    }, item.timeout);

    try {
      // 执行请求
      const result = await item.execute();
      
      // 清除超时
      if (item.timeoutId) {
        clearTimeout(item.timeoutId);
      }

      // 计算处理时间
      const processTime = Date.now() - item.startedAt!;
      this.stats.processTimes.push(processTime);

      console.log(` [LLMQueue] 处理成功: ${item.id}`);
      console.log(`   处理时间: ${processTime}ms`);

      // 解析 Promise
      item.resolve(result);

      // 更新统计
      this.stats.totalProcessed++;
      this.stats.totalSuccess++;
      this.stats.lastProcessedAt = Date.now();

      // 触发事件
      this.emit('success', item, result);
    } catch (error: any) {
      // 清除超时
      if (item.timeoutId) {
        clearTimeout(item.timeoutId);
      }

      console.error(` [LLMQueue] 处理失败: ${item.id}`, error.message);

      // 拒绝 Promise
      item.reject(error);

      // 更新统计
      this.stats.totalProcessed++;
      this.stats.totalFailed++;

      // 触发事件
      this.emit('error', item, error);
    } finally {
      // 移除活跃请求
      this.activeRequests.delete(item.id);

      // 继续处理下一个
      this.processQueue();
    }
  }

  /**
   * 处理超时
   */
  private handleTimeout(item: QueueItem): void {
    console.error(` [LLMQueue] 请求超时: ${item.id}`);
    console.error(`   超时设置: ${item.timeout}ms`);

    // 移除活跃请求
    this.activeRequests.delete(item.id);

    // 拒绝 Promise
    const error = new Error(`LLM 请求超时（${item.timeout}ms）`);
    item.reject(error);

    // 更新统计
    this.stats.totalProcessed++;
    this.stats.totalTimeout++;

    // 触发事件
    this.emit('timeout', item);

    // 继续处理下一个
    this.processQueue();
  }

  /**
   * 获取当前 RPM
   */
  private getCurrentRPM(): number {
    this.cleanupOldTimestamps();
    return this.requestTimestamps.length;
  }

  /**
   * 清理过期的时间戳（超过1分钟）
   */
  private cleanupOldTimestamps(): void {
    const oneMinuteAgo = Date.now() - 60000;
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);
  }

  /**
   * 计算百分位数
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * 获取统计信息
   */
  getStats(): QueueStats {
    const avgWaitTime = this.stats.waitTimes.length > 0
      ? this.stats.waitTimes.reduce((a, b) => a + b, 0) / this.stats.waitTimes.length
      : 0;

    const avgProcessTime = this.stats.processTimes.length > 0
      ? this.stats.processTimes.reduce((a, b) => a + b, 0) / this.stats.processTimes.length
      : 0;

    const utilizationRate = ((this.activeRequests.size / this.maxConcurrent) * 100).toFixed(1);

    return {
      queueLength: this.queue.length,
      activeRequests: this.activeRequests.size,
      
      totalProcessed: this.stats.totalProcessed,
      totalSuccess: this.stats.totalSuccess,
      totalFailed: this.stats.totalFailed,
      totalTimeout: this.stats.totalTimeout,
      
      averageWaitTime: Math.round(avgWaitTime),
      averageProcessTime: Math.round(avgProcessTime),
      p95WaitTime: this.calculatePercentile(this.stats.waitTimes, 95),
      p95ProcessTime: this.calculatePercentile(this.stats.processTimes, 95),
      
      currentRPM: this.getCurrentRPM(),
      maxRPM: this.maxRPM,
      currentConcurrency: this.activeRequests.size,
      maxConcurrency: this.maxConcurrent,
      utilizationRate: `${utilizationRate}%`,
      
      lastProcessedAt: this.stats.lastProcessedAt,
      uptime: Date.now() - this.stats.startTime,
    };
  }

  /**
   * 获取队列中的所有请求（用于调试）
   */
  getQueueItems(): Array<{ id: string; agentType: string; priority: number; waitTime: number }> {
    return this.queue.map(item => ({
      id: item.id,
      agentType: item.agentType || 'unknown',
      priority: item.priority,
      waitTime: Date.now() - item.createdAt,
    }));
  }

  /**
   * 暂停队列处理
   */
  pause(): void {
    this.isPaused = true;
    console.log('  [LLMQueue] 队列已暂停');
  }

  /**
   * 恢复队列处理
   */
  resume(): void {
    this.isPaused = false;
    console.log('  [LLMQueue] 队列已恢复');
    this.processQueue();
  }

  /**
   * 清空队列（拒绝所有等待的请求）
   */
  clear(): void {
    console.log(` [LLMQueue] 清空队列，拒绝 ${this.queue.length} 个请求`);
    
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (item) {
        item.reject(new Error('队列已清空'));
      }
    }
  }

  /**
   * 销毁队列（清理资源）
   */
  destroy(): void {
    console.log(' [LLMQueue] 销毁队列');
    
    // 清空队列
    this.clear();
    
    // 取消所有活跃请求的超时
    for (const item of this.activeRequests.values()) {
      if (item.timeoutId) {
        clearTimeout(item.timeoutId);
      }
    }
    
    // 移除所有监听器
    this.removeAllListeners();
  }
}

// 全局单例
let globalQueue: LLMRequestQueue | null = null;

/**
 * 获取全局队列实例
 */
export function getGlobalLLMQueue(): LLMRequestQueue {
  if (!globalQueue) {
    globalQueue = new LLMRequestQueue({
      maxConcurrent: parseInt(process.env.LLM_MAX_CONCURRENT || '50', 10),
      maxRPM: parseInt(process.env.LLM_MAX_RPM || '500', 10),
      defaultTimeout: parseInt(process.env.LLM_TIMEOUT || '60000', 10),
    });
  }
  return globalQueue;
}

/**
 * 重置全局队列（用于测试）
 */
export function resetGlobalLLMQueue(): void {
  if (globalQueue) {
    globalQueue.destroy();
    globalQueue = null;
  }
}

