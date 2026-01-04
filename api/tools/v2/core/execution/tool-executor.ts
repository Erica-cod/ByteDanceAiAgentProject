/**
 * 工具执行器
 *
 * 职责：
 * - 整合限流、缓存、熔断等保护机制
 * - 执行工具调用
 * - 记录指标和日志
 * - 实现降级链（参考 Netflix Hystrix）
 */

import { toolRegistry } from '../registry/tool-registry.js';
import { rateLimiter } from '../limits/rate-limiter.js';
import { cacheManager } from '../cache/cache-manager.js';
import { toolRuntime } from '../runtime/tool-runtime.js';
import type { ToolContext, ToolResult, ExecuteOptions, ToolMetrics, ToolStatus, ToolPlugin, FallbackStrategy } from '../types.js';

export class ToolExecutor {
  private metrics: Map<
    string,
    {
      totalCalls: number;
      successCalls: number;
      failedCalls: number;
      totalLatency: number;
      cacheHits: number;
    }
  > = new Map();

  /**
   * 执行工具
   */
  async execute(toolName: string, params: any, context: ToolContext, options: ExecuteOptions = {}): Promise<ToolResult> {
    const startTime = Date.now();
    const circuitBreaker = toolRuntime.getCircuitBreaker();

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
        const cached = await cacheManager.get(toolName, params, context);
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

        // 熔断时触发降级
        if (plugin.fallback?.enabled) {
          console.warn(`⚠️  工具 "${toolName}" 已熔断，尝试降级...`);
          return await this.executeFallbackChain(
            toolName,
            params,
            context,
            plugin,
            new Error(cbCheck.reason || '工具已熔断')
          );
        }

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
              circuitBreaker.recordFailure(toolName, { error: new Error('参数验证失败') });
              return {
                success: false,
                error: `参数验证失败: ${validation.errors?.join(', ')}`,
              };
            }
          }

          // 7. 执行工具（带超时控制）
          const timeout = options.timeout || plugin.rateLimit?.timeout || 30000;
          const result = await this.executeWithTimeout(plugin.execute(params, context), timeout, toolName);

          // 8. 记录成功
          metrics.successCalls++;
          circuitBreaker.recordSuccess(toolName, { result });

          // 9. 缓存结果（如果成功）
          if (result.success && !options.skipCache) {
            await cacheManager.set(toolName, params, context, result);
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
          circuitBreaker.recordSuccess(toolName, { result });
        } else {
          metrics.failedCalls++;
          circuitBreaker.recordFailure(toolName, { result });
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
      circuitBreaker.recordFailure(toolName, { error });

      const duration = Date.now() - startTime;
      metrics.totalLatency += duration;

      console.error(`❌ 工具 "${toolName}" 执行失败:`, error);

      // 主逻辑异常时也尝试降级链（参考 Hystrix：失败即 fallback）
      if (plugin.fallback?.enabled) {
        console.warn(`⚠️  工具 "${toolName}" 执行异常，尝试降级...`);
        const fallback = await this.executeFallbackChain(toolName, params, context, plugin, error);
        return {
          ...fallback,
          duration,
        };
      }

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
  private async executeWithTimeout<T>(promise: Promise<T>, timeout: number, toolName: string): Promise<T> {
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

    const circuitBreaker = toolRuntime.getCircuitBreaker();

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
    const cacheHitRate = metrics.totalCalls > 0 ? ((metrics.cacheHits / metrics.totalCalls) * 100).toFixed(1) : '0.0';

    // 计算错误率
    const errorRate = metrics.totalCalls > 0 ? ((metrics.failedCalls / metrics.totalCalls) * 100).toFixed(1) : '0.0';

    // 计算平均延迟
    const averageLatency = metrics.successCalls > 0 ? Math.round(metrics.totalLatency / metrics.successCalls) : 0;

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

  /**
   * 执行降级链（参考 Netflix Hystrix Fallback Chain）
   */
  private async executeFallbackChain(
    toolName: string,
    params: any,
    context: ToolContext,
    plugin: ToolPlugin,
    originalError: Error
  ): Promise<ToolResult> {
    const fallbackConfig = plugin.fallback;

    if (!fallbackConfig?.enabled || !fallbackConfig.fallbackChain.length) {
      return {
        success: false,
        error: originalError.message,
      };
    }

    console.log(`🔄 [Fallback Chain] 开始降级，共 ${fallbackConfig.fallbackChain.length} 个策略`);

    // 按降级链顺序尝试
    for (let i = 0; i < fallbackConfig.fallbackChain.length; i++) {
      const strategy = fallbackConfig.fallbackChain[i];
      console.log(`   ${i + 1}/${fallbackConfig.fallbackChain.length} 尝试降级策略: ${strategy.type}`);

      try {
        const result = await this.executeFallbackStrategy(strategy, toolName, params, context, plugin, fallbackConfig);

        if (result) {
          console.log(`   ✅ 降级策略 "${strategy.type}" 成功`);
          return {
            ...result,
            degraded: true,
            degradedBy: strategy.type,
          };
        }
      } catch (error: any) {
        console.warn(`   ❌ 降级策略 "${strategy.type}" 失败: ${error.message}`);
        continue;
      }
    }

    // 所有降级策略都失败
    console.error(`🚫 [Fallback Chain] 所有降级策略都失败`);
    return {
      success: false,
      error: `服务不可用，所有降级方案均失败。原始错误: ${originalError.message}`,
      degraded: true,
    };
  }

  /**
   * 执行单个降级策略
   */
  private async executeFallbackStrategy(
    strategy: FallbackStrategy,
    toolName: string,
    params: any,
    context: ToolContext,
    plugin: ToolPlugin,
    fallbackConfig: any
  ): Promise<ToolResult | null> {
    const timeout = fallbackConfig.fallbackTimeout || 5000;

    switch (strategy.type) {
      case 'cache':
        // 策略 1: 返回正常缓存
        return await cacheManager.get(toolName, params, context);

      case 'stale-cache':
        // 策略 2: 返回过期缓存
        if (fallbackConfig.allowStaleCache !== false) {
          return await cacheManager.getStale(toolName, params, context);
        }
        return null;

      case 'fallback-tool':
        // 策略 3: 切换到备用工具
        if (fallbackConfig.fallbackTool) {
          console.log(`   ↪️  切换到备用工具: ${fallbackConfig.fallbackTool}`);
          return await Promise.race([
            this.execute(fallbackConfig.fallbackTool, params, context, { timeout }),
            new Promise<ToolResult>((_, reject) => setTimeout(() => reject(new Error('备用工具超时')), timeout)),
          ]);
        }
        return null;

      case 'simplified':
        // 策略 4: 简化调用（用更少的参数重试主服务）
        if (fallbackConfig.simplifiedParams) {
          console.log(`   ⚡ 尝试简化调用`);
          const simplifiedParams = {
            ...params,
            ...fallbackConfig.simplifiedParams,
          };

          // 跳过熔断检查，直接执行
          try {
            const result = await Promise.race([
              plugin.execute(simplifiedParams, context),
              new Promise<ToolResult>((_, reject) => setTimeout(() => reject(new Error('简化调用超时')), timeout)),
            ]);

            if (result.success) {
              return result;
            }
          } catch (error) {
            // 简化调用失败，继续下一个策略
          }
        }
        return null;

      case 'default':
        // 策略 5: 返回默认响应（兜底）
        if (fallbackConfig.defaultResponse) {
          console.log(`   📦 返回默认响应`);
          return {
            ...fallbackConfig.defaultResponse,
            message: fallbackConfig.defaultResponse.message || '服务降级，返回默认数据',
          };
        }
        return null;

      default:
        console.warn(`   ⚠️  未知的降级策略类型: ${strategy.type}`);
        return null;
    }
  }
}

// 单例实例
export const toolExecutor = new ToolExecutor();


