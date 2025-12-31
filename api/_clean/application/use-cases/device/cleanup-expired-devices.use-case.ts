/**
 * Cleanup Expired Devices Use Case - 清理过期设备用例
 * 
 * 职责：
 * - 协调清理过期设备的业务流程
 * - 实现 GDPR 存储限制原则（30 天 TTL）
 * - 定期执行清理任务
 */

import { IDeviceRepository } from '../../interfaces/repositories/device.repository.interface.js';

export class CleanupExpiredDevicesUseCase {
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
   */
  startPeriodicCleanup(): void {
    setInterval(() => {
      this.execute().catch(err => {
        console.error('❌ Periodic cleanup failed:', err);
      });
    }, 3600000); // 1 小时

    console.log('🧹 Periodic device cleanup started (every hour)');
  }
}

