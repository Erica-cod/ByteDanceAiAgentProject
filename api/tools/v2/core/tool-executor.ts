/**
 * 工具执行器
 * 
 * 职责：
 * - 整合限流、缓存、熔断等保护机制
 * - 执行工具调用
 * - 记录指标和日志
 */

import { toolRegistry } from './tool-registry.js';
import { rateLimiter } from './rate-limiter.js';
import { cacheManager } from './cache-manager.js';
import { circuitBreaker } from './circuit-breaker.js';
import type { ToolContext, ToolResult, ExecuteOptions, ToolMetrics, ToolStatus } from './types.js';

export class ToolExecutor {
  private metrics: Map<string, {
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    totalLatency: number;
    cacheHits: number;
  }> = new Map();

  /**
   * 执行工具
   */
  async execute(
    toolName: string,
    params: any,
    context: ToolContext,
    options: ExecuteOptions = {}
  ): Promise<ToolResult> {
    const startTime = Date.now();
    
    // 1. 获取工具插件
    const plugin = toolRegistry.get(toolName);
    if (!plugin) {
      return {
        success: false,
        error: `工具 "${toolName}" 不存在`,
      };
    }

    // 2. 检查工具是否启用
    if (plugin.metadata.enabled === false) {
      return {
        success: false,
        error: `工具 "${toolName}" 已禁用`,
      };
    }

    // 初始化指标
    this.initMetrics(toolName);
    const metrics = this.metrics.get(toolName)!;
    metrics.totalCalls++;

    try {
      // 3. 检查缓存
      if (!options.skipCache) {
        const cached = cacheManager.get(toolName, params, context);
        if (cached) {
          metrics.successCalls++;
          metrics.cacheHits++;
          
          const duration = Date.now() - startTime;
          metrics.totalLatency += duration;
          
          return {
            ...cached,
            duration,
            fromCache: true,
          };
        }
      }

      // 4. 检查熔断器
      const cbCheck = circuitBreaker.canExecute(toolName);
      if (!cbCheck.allowed) {
        metrics.failedCalls++;
        return {
          success: false,
          error: cbCheck.reason || '工具不可用',
        };
      }

      // 5. 限流检查
      if (!options.skipRateLimit) {
        const rlResult = await rateLimiter.acquire(toolName);
        if (!rlResult.ok) {
          metrics.failedCalls++;
          return {
            success: false,
            error: rlResult.reason || '请求过于频繁',
          };
        }

        try {
          // 6. 参数验证
          if (plugin.validate) {
            const validation = await plugin.validate(params);
            if (!validation.valid) {
              metrics.failedCalls++;
              circuitBreaker.recordFailure(toolName);
              return {
                success: false,
                error: `参数验证失败: ${validation.errors?.join(', ')}`,
              };
            }
          }

          // 7. 执行工具（带超时控制）
          const timeout = options.timeout || plugin.rateLimit?.timeout || 30000;
          const result = await this.executeWithTimeout(
            plugin.execute(params, context),
            timeout,
            toolName
          );

          // 8. 记录成功
          metrics.successCalls++;
          circuitBreaker.recordSuccess(toolName);

          // 9. 缓存结果（如果成功）
          if (result.success && !options.skipCache) {
            cacheManager.set(toolName, params, context, result);
          }

          // 10. 记录耗时
          const duration = Date.now() - startTime;
          metrics.totalLatency += duration;

          return {
            ...result,
            duration,
            fromCache: false,
          };
        } finally {
          // 确保释放限流资源
          if (rlResult.release) {
            rlResult.release();
          }
        }
      } else {
        // 跳过限流时的执行逻辑
        const result = await plugin.execute(params, context);
        
        if (result.success) {
          metrics.successCalls++;
          circuitBreaker.recordSuccess(toolName);
        } else {
          metrics.failedCalls++;
          circuitBreaker.recordFailure(toolName);
        }

        const duration = Date.now() - startTime;
        metrics.totalLatency += duration;

        return {
          ...result,
          duration,
          fromCache: false,
        };
      }
    } catch (error: any) {
      // 执行失败
      metrics.failedCalls++;
      circuitBreaker.recordFailure(toolName);

      const duration = Date.now() - startTime;
      metrics.totalLatency += duration;

      console.error(`❌ 工具 "${toolName}" 执行失败:`, error);

      return {
        success: false,
        error: error.message || '工具执行失败',
        duration,
      };
    }
  }

  /**
   * 带超时控制的执行
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeout: number,
    toolName: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`工具 "${toolName}" 执行超时（${timeout}ms）`));
        }, timeout);
      }),
    ]);
  }

  /**
   * 初始化工具指标
   */
  private initMetrics(toolName: string): void {
    if (!this.metrics.has(toolName)) {
      this.metrics.set(toolName, {
        totalCalls: 0,
        successCalls: 0,
        failedCalls: 0,
        totalLatency: 0,
        cacheHits: 0,
      });
    }
  }

  /**
   * 获取工具指标
   */
  getMetrics(toolName: string): ToolMetrics | null {
    const plugin = toolRegistry.get(toolName);
    if (!plugin) return null;

    const metrics = this.metrics.get(toolName);
    if (!metrics) return null;

    const rlStatus = rateLimiter.getStatus(toolName);
    const cbState = circuitBreaker.getState(toolName);
    const cacheStats = cacheManager.getToolStats(toolName);

    // 计算状态
    let status: ToolStatus = 'healthy';
    if (plugin.metadata.enabled === false) {
      status = 'disabled';
    } else if (cbState === 'open') {
      status = 'unavailable';
    } else if (cbState === 'half-open') {
      status = 'degraded';
    }

    // 计算缓存命中率
    const cacheHitRate = metrics.totalCalls > 0
      ? (metrics.cacheHits / metrics.totalCalls * 100).toFixed(1)
      : '0.0';

    // 计算错误率
    const errorRate = metrics.totalCalls > 0
      ? (metrics.failedCalls / metrics.totalCalls * 100).toFixed(1)
      : '0.0';

    // 计算平均延迟
    const averageLatency = metrics.successCalls > 0
      ? Math.round(metrics.totalLatency / metrics.successCalls)
      : 0;

    return {
      name: toolName,
      status,
      concurrent: rlStatus?.concurrent || 'N/A',
      perMinute: rlStatus?.perMinute || 'N/A',
      utilizationRate: rlStatus?.utilizationRate || 'N/A',
      cacheHitRate: `${cacheHitRate}%`,
      averageLatency,
      errorRate: `${errorRate}%`,
      circuitBreakerState: cbState,
      totalCalls: metrics.totalCalls,
      successCalls: metrics.successCalls,
      failedCalls: metrics.failedCalls,
    };
  }

  /**
   * 获取所有工具的指标
   */
  getAllMetrics(): ToolMetrics[] {
    const allTools = toolRegistry.getAllNames();
    return allTools.map(name => this.getMetrics(name)).filter(m => m !== null) as ToolMetrics[];
  }

  /**
   * 重置工具指标
   */
  resetMetrics(toolName: string): void {
    this.metrics.delete(toolName);
    console.log(`🔄 工具 "${toolName}" 指标已重置`);
  }

  /**
   * 重置所有指标
   */
  resetAllMetrics(): void {
    this.metrics.clear();
    console.log('🔄 所有工具指标已重置');
  }
}

// 单例实例
export const toolExecutor = new ToolExecutor();

