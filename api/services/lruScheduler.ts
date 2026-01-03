/**
 * LRU Scheduler - LRU 定期清理任务调度器
 * 
 * 职责：
 * 1. 定期执行 MongoDB 对话清理任务
 * 2. 提供手动触发清理的接口
 * 3. 记录清理任务的执行历史
 */

import { getConversationLRUService } from './conversationLRUService.js';
import { getLRUConfig } from '../config/lruConfig.js';

class LRUScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private lastRunAt: Date | null = null;
  private lastResult: any = null;

  /**
   * 启动定期清理任务
   */
  start(): void {
    if (this.intervalId) {
      console.log('⚠️ LRU 调度器已在运行');
      return;
    }

    const config = getLRUConfig();
    const intervalMs = config.mongodb.cleanupIntervalHours * 60 * 60 * 1000;

    console.log(`✅ 启动 LRU 调度器，间隔: ${config.mongodb.cleanupIntervalHours} 小时`);

    // 立即执行一次
    this.runCleanup();

    // 设置定期任务
    this.intervalId = setInterval(() => {
      this.runCleanup();
    }, intervalMs);
  }

  /**
   * 停止定期清理任务
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('✅ 停止 LRU 调度器');
    }
  }

  /**
   * 执行清理任务（带并发控制）
   */
  private async runCleanup(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ LRU 清理任务正在运行，跳过本次执行');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log('🧹 [LRU 调度器] 开始执行定期清理任务...');

      const lruService = getConversationLRUService();
      const result = await lruService.runFullCleanup();

      this.lastRunAt = new Date();
      this.lastResult = {
        ...result,
        duration: Date.now() - startTime,
        timestamp: this.lastRunAt,
      };

      console.log('✅ [LRU 调度器] 清理任务完成:', this.lastResult);
    } catch (error) {
      console.error('❌ [LRU 调度器] 清理任务失败:', error);
      this.lastResult = {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 手动触发清理任务
   */
  async triggerCleanup(): Promise<any> {
    console.log('🔧 [LRU 调度器] 手动触发清理任务...');
    await this.runCleanup();
    return this.lastResult;
  }

  /**
   * 获取调度器状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.intervalId !== null,
      lastRunAt: this.lastRunAt,
      lastResult: this.lastResult,
      config: getLRUConfig(),
    };
  }
}

// 导出单例
let schedulerInstance: LRUScheduler | null = null;

export function getLRUScheduler(): LRUScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new LRUScheduler();
  }
  return schedulerInstance;
}

/**
 * 在应用启动时自动启动调度器
 */
export function startLRUScheduler(): void {
  const scheduler = getLRUScheduler();
  scheduler.start();
}

/**
 * 在应用关闭时停止调度器
 */
export function stopLRUScheduler(): void {
  const scheduler = getLRUScheduler();
  scheduler.stop();
}

