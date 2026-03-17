/**
 * 熔断器
 *
 * 功能：
 * - 当工具连续失败达到阈值时，熔断（拒绝请求）
 * - 半开状态：定时尝试恢复
 * - 自动关闭：成功后恢复正常
 */

import type { CircuitBreakerConfig } from '../types.js';

type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitStats {
  failures: number;
  successes: number;
  lastFailureTime: number;
  lastSuccessTime: number;
}

export class CircuitBreaker {
  private states: Map<string, CircuitState> = new Map();
  private stats: Map<string, CircuitStats> = new Map();
  private configs: Map<string, CircuitBreakerConfig> = new Map();
  private resetTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * 设置工具的熔断配置
   */
  setConfig(toolName: string, config: CircuitBreakerConfig): void {
    this.configs.set(toolName, config);
    this.states.set(toolName, 'closed'); // 初始为关闭状态（正常）
    this.stats.set(toolName, {
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      lastSuccessTime: 0,
    });
  }

  /**
   * 检查是否允许执行
   */
  canExecute(toolName: string): { allowed: boolean; reason?: string } {
    const config = this.configs.get(toolName);

    // 未启用熔断器
    if (!config || !config.enabled) {
      return { allowed: true };
    }

    const state = this.states.get(toolName) || 'closed';

    switch (state) {
      case 'closed':
        // 正常状态，允许执行
        return { allowed: true };

      case 'open':
        // 熔断状态，拒绝执行
        return {
          allowed: false,
          reason: `工具 "${toolName}" 已熔断（连续失败过多），请稍后重试`,
        };

      case 'half-open': {
        // 半开状态，允许少量请求测试
        const halfOpenRequests = config.halfOpenRequests || 1;
        const stats = this.stats.get(toolName)!;

        if (stats.successes < halfOpenRequests) {
          return { allowed: true };
        } else {
          // 已达到测试请求上限，拒绝
          return {
            allowed: false,
            reason: `工具 "${toolName}" 正在恢复中，请稍后重试`,
          };
        }
      }
    }
  }

  /**
   * 记录成功
   */
  recordSuccess(toolName: string, _info?: { result?: any }): void {
    const config = this.configs.get(toolName);
    if (!config || !config.enabled) return;

    const state = this.states.get(toolName)!;
    const stats = this.stats.get(toolName)!;

    stats.successes++;
    stats.lastSuccessTime = Date.now();

    if (state === 'half-open') {
      // 半开状态下成功 → 关闭熔断器（恢复正常）
      this.close(toolName);
    } else if (state === 'closed') {
      // 正常状态下成功 → 重置失败计数
      stats.failures = 0;
    }
  }

  /**
   * 记录失败
   */
  recordFailure(toolName: string, _info?: { error?: any; result?: any }): void {
    const config = this.configs.get(toolName);
    if (!config || !config.enabled) return;

    const state = this.states.get(toolName)!;
    const stats = this.stats.get(toolName)!;

    stats.failures++;
    stats.lastFailureTime = Date.now();

    console.warn(`⚠️  工具 "${toolName}" 执行失败（${stats.failures}/${config.failureThreshold}）`);

    if (state === 'half-open') {
      // 半开状态下失败 → 重新打开熔断器
      this.open(toolName);
    } else if (state === 'closed') {
      // 正常状态下检查是否达到阈值
      if (stats.failures >= config.failureThreshold) {
        this.open(toolName);
      }
    }
  }

  /**
   * 打开熔断器（熔断）
   */
  private open(toolName: string): void {
    const config = this.configs.get(toolName)!;

    this.states.set(toolName, 'open');
    console.error(`🚨 工具 "${toolName}" 已熔断，将在 ${config.resetTimeout}ms 后尝试恢复`);

    // 清除旧的定时器
    const oldTimer = this.resetTimers.get(toolName);
    if (oldTimer) clearTimeout(oldTimer);

    // 设置定时器：一段时间后进入半开状态
    const timer = setTimeout(() => {
      this.halfOpen(toolName);
    }, config.resetTimeout);

    this.resetTimers.set(toolName, timer);
  }

  /**
   * 进入半开状态
   */
  private halfOpen(toolName: string): void {
    this.states.set(toolName, 'half-open');

    const stats = this.stats.get(toolName)!;
    stats.successes = 0; // 重置成功计数，用于测试

    console.log(`🔄 工具 "${toolName}" 进入半开状态，开始测试恢复`);
  }

  /**
   * 关闭熔断器（恢复正常）
   */
  private close(toolName: string): void {
    this.states.set(toolName, 'closed');

    const stats = this.stats.get(toolName)!;
    stats.failures = 0;
    stats.successes = 0;

    // 清除定时器
    const timer = this.resetTimers.get(toolName);
    if (timer) {
      clearTimeout(timer);
      this.resetTimers.delete(toolName);
    }

    console.log(`✅ 工具 "${toolName}" 熔断器已关闭，恢复正常`);
  }

  /**
   * 手动重置熔断器
   */
  reset(toolName: string): void {
    this.close(toolName);
    console.log(`🔄 工具 "${toolName}" 熔断器已手动重置`);
  }

  /**
   * 获取工具的熔断状态
   */
  getState(toolName: string): CircuitState {
    return this.states.get(toolName) || 'closed';
  }

  /**
   * 获取工具的统计信息
   */
  getStats(toolName: string) {
    const stats = this.stats.get(toolName);
    if (!stats) return null;

    const state = this.getState(toolName);
    const total = stats.failures + stats.successes;
    const failureRate = total > 0 ? ((stats.failures / total) * 100).toFixed(1) : '0.0';

    return {
      state,
      failures: stats.failures,
      successes: stats.successes,
      failureRate: `${failureRate}%`,
      lastFailure: stats.lastFailureTime > 0 ? new Date(stats.lastFailureTime).toISOString() : null,
      lastSuccess: stats.lastSuccessTime > 0 ? new Date(stats.lastSuccessTime).toISOString() : null,
    };
  }

  /**
   * 清理资源
   */
  destroy(): void {
    // 清除所有定时器
    for (const timer of this.resetTimers.values()) {
      clearTimeout(timer);
    }
    this.resetTimers.clear();
  }
}

// 单例实例
export const circuitBreaker = new CircuitBreaker();


