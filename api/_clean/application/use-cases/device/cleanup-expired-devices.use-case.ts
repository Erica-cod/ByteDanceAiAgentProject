/**
 * Cleanup Expired Devices Use Case - 清理过期设备用例
 * 
 * 职责：
 * - 协调清理过期设备的业务流程
 * - 实现 GDPR 存储限制原则（30 天 TTL）
 * - 定期执行清理任务
 * 
 * 🔒 单例模式：防止多次启动定期清理任务
 */

import { IDeviceRepository } from '../../interfaces/repositories/device.repository.interface.js';

export class CleanupExpiredDevicesUseCase {
  // 🔒 单例标志：确保定期清理只启动一次
  private static isPeriodicCleanupStarted = false;
  private static cleanupIntervalId: NodeJS.Timeout | null = null;

  constructor(private deviceRepository: IDeviceRepository) {}

  /**
   * 执行清理过期设备
   * @returns 清理的设备数量
   */
  async execute(): Promise<number> {
    try {
      console.log('🗑️ Cleaning up expired devices...');

      const deletedCount = await this.deviceRepository.cleanupExpired();

      if (deletedCount > 0) {
        console.log(`✅ Cleaned ${deletedCount} expired devices`);
      } else {
        console.log('✅ No expired devices to clean');
      }

      return deletedCount;
    } catch (error) {
      console.error('❌ Cleanup expired devices error:', error);
      throw error;
    }
  }

  /**
   * 启动定期清理（每小时执行）
   * 🔒 使用单例模式，确保只启动一次
   */
  startPeriodicCleanup(): void {
    // 🔒 如果已经启动，直接返回
    if (CleanupExpiredDevicesUseCase.isPeriodicCleanupStarted) {
      console.log('⚠️ Periodic device cleanup already started, skipping...');
      return;
    }

    // 标记为已启动
    CleanupExpiredDevicesUseCase.isPeriodicCleanupStarted = true;

    // 启动定时器
    CleanupExpiredDevicesUseCase.cleanupIntervalId = setInterval(() => {
      this.execute().catch(err => {
        console.error('❌ Periodic cleanup failed:', err);
      });
    }, 3600000); // 1 小时

    console.log('🧹 Periodic device cleanup started (every hour)');
  }

  /**
   * 停止定期清理（用于测试或优雅关闭）
   */
  stopPeriodicCleanup(): void {
    if (CleanupExpiredDevicesUseCase.cleanupIntervalId) {
      clearInterval(CleanupExpiredDevicesUseCase.cleanupIntervalId);
      CleanupExpiredDevicesUseCase.cleanupIntervalId = null;
      CleanupExpiredDevicesUseCase.isPeriodicCleanupStarted = false;
      console.log('🛑 Periodic device cleanup stopped');
    }
  }
}

