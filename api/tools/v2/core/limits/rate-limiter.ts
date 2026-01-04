/**
 * 工具限流器
 *
 * 功能：
 * - 并发限制
 * - 频率限制（滑动窗口）
 * - 超时控制
 */

import type { RateLimitConfig } from '../types.js';

interface AcquireResult {
  ok: boolean;
  release?: () => void;
  reason?: string;
  retryAfter?: number;
}

export class RateLimiter {
  private concurrentCounts: Map<string, number> = new Map();
  private callHistory: Map<string, number[]> = new Map();
  private configs: Map<string, RateLimitConfig> = new Map();

  /**
   * 设置工具的限流配置
   */
  setConfig(toolName: string, config: RateLimitConfig): void {
    this.configs.set(toolName, config);
  }

  /**
   * 尝试获取执行权限
   */
  async acquire(toolName: string): Promise<AcquireResult> {
    const config = this.configs.get(toolName);

    // 没有配置则不限流
    if (!config) {
      return { ok: true, release: () => {} };
    }

    // 检查并发限制
    const currentConcurrent = this.concurrentCounts.get(toolName) || 0;
    if (currentConcurrent >= config.maxConcurrent) {
      console.warn(`⚠️  工具 "${toolName}" 达到并发上限: ${currentConcurrent}/${config.maxConcurrent}`);
      return {
        ok: false,
        reason: `工具繁忙，当前并发: ${currentConcurrent}/${config.maxConcurrent}`,
        retryAfter: 3,
      };
    }

    // 检查频率限制（滑动窗口）
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const history = this.callHistory.get(toolName) || [];

    // 清理过期记录
    const recentCalls = history.filter(timestamp => timestamp > oneMinuteAgo);

    if (recentCalls.length >= config.maxPerMinute) {
      console.warn(`⚠️  工具 "${toolName}" 达到频率上限: ${recentCalls.length}/${config.maxPerMinute} 次/分钟`);

      // 计算需要等待多少秒
      const oldestCall = recentCalls[0];
      const waitTime = Math.ceil((oldestCall + 60000 - now) / 1000);

      return {
        ok: false,
        reason: `工具调用过于频繁: ${recentCalls.length}/${config.maxPerMinute} 次/分钟`,
        retryAfter: waitTime,
      };
    }

    // 占用资源
    this.concurrentCounts.set(toolName, currentConcurrent + 1);
    recentCalls.push(now);
    this.callHistory.set(toolName, recentCalls);

    console.log(`🔧 工具 "${toolName}" 获取执行权限，当前并发: ${currentConcurrent + 1}/${config.maxConcurrent}`);

    // 返回释放函数
    let released = false;
    const release = () => {
      if (released) return;
      released = true;

      const prev = this.concurrentCounts.get(toolName) || 0;
      const next = Math.max(0, prev - 1);
      this.concurrentCounts.set(toolName, next);

      console.log(`✅ 工具 "${toolName}" 释放资源，当前并发: ${next}/${config.maxConcurrent}`);
    };

    // 设置超时自动释放
    const timeoutId = setTimeout(() => {
      if (!released) {
        console.warn(`⏰ 工具 "${toolName}" 执行超时（${config.timeout}ms），强制释放`);
        release();
      }
    }, config.timeout);

    // 返回增强的释放函数（清理超时定时器）
    return {
      ok: true,
      release: () => {
        clearTimeout(timeoutId);
        release();
      },
    };
  }

  /**
   * 获取工具的当前状态
   */
  getStatus(toolName: string) {
    const config = this.configs.get(toolName);
    if (!config) return null;

    const concurrent = this.concurrentCounts.get(toolName) || 0;
    const history = this.callHistory.get(toolName) || [];
    const recentCalls = history.filter(t => t > Date.now() - 60000).length;

    return {
      concurrent: `${concurrent}/${config.maxConcurrent}`,
      perMinute: `${recentCalls}/${config.maxPerMinute}`,
      utilizationRate: ((concurrent / config.maxConcurrent) * 100).toFixed(1) + '%',
    };
  }

  /**
   * 重置工具的限流状态（用于测试或紧急情况）
   */
  reset(toolName: string): void {
    this.concurrentCounts.delete(toolName);
    this.callHistory.delete(toolName);
    console.log(`🔄 工具 "${toolName}" 限流状态已重置`);
  }

  /**
   * 重置所有工具的限流状态
   */
  resetAll(): void {
    this.concurrentCounts.clear();
    this.callHistory.clear();
    console.log('🔄 所有工具限流状态已重置');
  }
}

// 单例实例
export const rateLimiter = new RateLimiter();


