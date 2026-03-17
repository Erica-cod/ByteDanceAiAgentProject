/**
 * HTTP 状态码熔断器（占位实现/骨架）
 *
 * 目的：提供“按 HTTP 状态码熔断”的可插拔结构。
 * 说明：这里不实现完整策略细节，只给出：
 * - 如何读取 per-tool 配置
 * - 如何从 ToolExecutor 传入的 info 里拿到 result/error 信息
 * - 如何维护 per-tool 的状态与计数
 *
 * 配置约定（挂在 CircuitBreakerConfig.strategies.httpStatus 下）：
 * strategies: {
 *   httpStatus: {
 *     enabled: true,
 *     statusCodes: [429, 500, 502, 503, 504],
 *     failureThreshold: 3
 *   }
 * }
 */

import type { CircuitBreakerConfig, CircuitBreakerProvider } from '../types.js';
import type { ToolResult } from '../types.js';

type CircuitState = 'closed' | 'open' | 'half-open';

interface HttpStatusStrategyConfig {
  enabled: boolean;
  statusCodes: number[];
  failureThreshold: number;
}

interface CircuitStats {
  failures: number;
  successes: number;
  lastFailureTime: number;
  lastSuccessTime: number;
}

export class HttpStatusCircuitBreaker implements CircuitBreakerProvider {
  private states: Map<string, CircuitState> = new Map();
  private stats: Map<string, CircuitStats> = new Map();
  private baseConfigs: Map<string, CircuitBreakerConfig> = new Map();
  private resetTimers: Map<string, NodeJS.Timeout> = new Map();

  setConfig(toolName: string, config: CircuitBreakerConfig): void {
    this.baseConfigs.set(toolName, config);
    this.states.set(toolName, 'closed');
    this.stats.set(toolName, {
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      lastSuccessTime: 0,
    });
  }

  private getStrategyConfig(toolName: string): HttpStatusStrategyConfig | null {
    const base = this.baseConfigs.get(toolName);
    if (!base || !base.enabled) return null;

    const cfg = base.strategies?.httpStatus;
    if (!cfg || cfg.enabled !== true) return null;

    const statusCodes = Array.isArray(cfg.statusCodes) ? cfg.statusCodes : [];
    const failureThreshold = typeof cfg.failureThreshold === 'number' ? cfg.failureThreshold : base.failureThreshold;

    return {
      enabled: true,
      statusCodes,
      failureThreshold,
    };
  }

  canExecute(toolName: string): { allowed: boolean; reason?: string } {
    const cfg = this.getStrategyConfig(toolName);
    if (!cfg) return { allowed: true };

    const state = this.states.get(toolName) || 'closed';
    if (state === 'closed') return { allowed: true };
    if (state === 'open') {
      return { allowed: false, reason: `工具 "${toolName}" 因 HTTP 状态码错误已熔断，请稍后重试` };
    }

    // half-open：允许 1 次探测（占位）
    const s = this.stats.get(toolName)!;
    if (s.successes < 1) return { allowed: true };
    return { allowed: false, reason: `工具 "${toolName}" 正在恢复中，请稍后重试` };
  }

  recordSuccess(toolName: string, _info?: { result?: ToolResult }): void {
    const cfg = this.getStrategyConfig(toolName);
    if (!cfg) return;

    const state = this.states.get(toolName) || 'closed';
    const s = this.stats.get(toolName)!;
    s.successes++;
    s.lastSuccessTime = Date.now();

    if (state === 'half-open') {
      this.close(toolName);
    } else if (state === 'closed') {
      s.failures = 0;
    }
  }

  recordFailure(toolName: string, info?: { error?: any; result?: ToolResult }): void {
    const cfg = this.getStrategyConfig(toolName);
    if (!cfg) return;

    const httpStatus = this.extractHttpStatus(info);
    if (httpStatus == null) {
      // 没有 HTTP 状态码信息 → 本策略不处理
      return;
    }

    if (!cfg.statusCodes.includes(httpStatus)) {
      // 状态码不在熔断范围 → 本策略不处理
      return;
    }

    const state = this.states.get(toolName) || 'closed';
    const s = this.stats.get(toolName)!;
    s.failures++;
    s.lastFailureTime = Date.now();

    if (state === 'half-open') {
      this.open(toolName);
    } else if (state === 'closed') {
      if (s.failures >= cfg.failureThreshold) {
        this.open(toolName);
      }
    }
  }

  reset(toolName: string): void {
    this.close(toolName);
  }

  getState(toolName: string): CircuitState {
    return this.states.get(toolName) || 'closed';
  }

  getStats(toolName: string): any {
    const s = this.stats.get(toolName);
    if (!s) return null;
    const state = this.getState(toolName);
    return { type: 'httpStatus', state, ...s };
  }

  destroy(): void {
    for (const timer of this.resetTimers.values()) clearTimeout(timer);
    this.resetTimers.clear();
  }

  private extractHttpStatus(info?: { error?: any; result?: ToolResult }): number | null {
    // 占位：约定你后续在 ToolResult.meta.httpStatus 或 error.statusCode 上挂值
    const fromResult = (info?.result as any)?.meta?.httpStatus;
    if (typeof fromResult === 'number') return fromResult;

    const fromError = info?.error?.statusCode ?? info?.error?.status;
    if (typeof fromError === 'number') return fromError;

    return null;
  }

  private open(toolName: string): void {
    const base = this.baseConfigs.get(toolName);
    const resetTimeout = base?.resetTimeout ?? 30_000;

    this.states.set(toolName, 'open');

    const old = this.resetTimers.get(toolName);
    if (old) clearTimeout(old);

    const timer = setTimeout(() => this.halfOpen(toolName), resetTimeout);
    this.resetTimers.set(toolName, timer);
  }

  private halfOpen(toolName: string): void {
    this.states.set(toolName, 'half-open');
    const s = this.stats.get(toolName);
    if (s) s.successes = 0;
  }

  private close(toolName: string): void {
    this.states.set(toolName, 'closed');
    const s = this.stats.get(toolName);
    if (s) {
      s.failures = 0;
      s.successes = 0;
    }
    const timer = this.resetTimers.get(toolName);
    if (timer) {
      clearTimeout(timer);
      this.resetTimers.delete(toolName);
    }
  }
}

// 方便直接 new 不带依赖（也可导出单例）
export const httpStatusCircuitBreaker = new HttpStatusCircuitBreaker();


