/**
 * 工具系统运行时（可插拔组件容器）
 *
 * 目标：让“熔断器/协议/缓存/限流”等关键组件可以在不改业务代码的情况下替换实现。
 * 当前先抽象熔断器（后续你可以继续把其他组件也收敛进 runtime）。
 */

import type { CircuitBreakerProvider } from '../types.js';
import { circuitBreaker as defaultCircuitBreaker } from '../resilience/circuit-breaker.js';

export class ToolRuntime {
  private circuitBreaker: CircuitBreakerProvider = defaultCircuitBreaker;

  /**
   * 设置熔断器实现（可插拔）
   */
  setCircuitBreaker(provider: CircuitBreakerProvider): void {
    this.circuitBreaker = provider;
  }

  /**
   * 获取当前熔断器实现
   */
  getCircuitBreaker(): CircuitBreakerProvider {
    return this.circuitBreaker;
  }
}

// 单例运行时
export const toolRuntime = new ToolRuntime();


