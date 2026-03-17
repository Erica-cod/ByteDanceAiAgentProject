/**
 * 组合熔断器（可插拔骨架）
 *
 * 用途：
 * - 组合多个“熔断器实现/策略”并行工作（例如：连续失败熔断 + HTTP 状态码熔断）
 * - canExecute：任意一个策略拒绝执行，就整体拒绝（更保守、更安全）
 * - recordSuccess/recordFailure：将结果/错误上下文广播给所有策略
 *
 * 启用/切换方式（没有“注册表”）：
 * - 在启动阶段把 CompositeCircuitBreaker 注入 toolRuntime：
 *   toolRuntime.setCircuitBreaker(new CompositeCircuitBreaker([circuitBreaker, httpStatusCircuitBreaker]))
 */

import type { CircuitBreakerConfig, CircuitBreakerProvider } from '../types.js';

export class CompositeCircuitBreaker implements CircuitBreakerProvider {
  constructor(private readonly providers: CircuitBreakerProvider[]) {}

  setConfig(toolName: string, config: CircuitBreakerConfig): void {
    for (const p of this.providers) {
      p.setConfig(toolName, config);
    }
  }

  canExecute(toolName: string): { allowed: boolean; reason?: string } {
    for (const p of this.providers) {
      const r = p.canExecute(toolName);
      if (!r.allowed) return r;
    }
    return { allowed: true };
  }

  recordSuccess(toolName: string, info?: { result?: any }): void {
    for (const p of this.providers) {
      p.recordSuccess(toolName, info);
    }
  }

  recordFailure(toolName: string, info?: { error?: any; result?: any }): void {
    for (const p of this.providers) {
      p.recordFailure(toolName, info);
    }
  }

  reset(toolName: string): void {
    for (const p of this.providers) {
      p.reset(toolName);
    }
  }

  getState(toolName: string): 'closed' | 'open' | 'half-open' {
    // 对外暴露“最差状态”（open > half-open > closed）
    const states = this.providers.map(p => p.getState(toolName));
    if (states.includes('open')) return 'open';
    if (states.includes('half-open')) return 'half-open';
    return 'closed';
  }

  getStats(toolName: string): any {
    return {
      type: 'composite',
      providers: this.providers.map(p => ({
        state: p.getState(toolName),
        stats: p.getStats(toolName),
      })),
    };
  }

  destroy(): void {
    for (const p of this.providers) {
      p.destroy?.();
    }
  }
}


