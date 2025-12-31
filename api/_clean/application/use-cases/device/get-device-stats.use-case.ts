/**
 * Get Device Stats Use Case - 获取设备统计用例
 * 
 * 职责：
 * - 协调获取设备统计信息的业务流程
 * - 返回设备统计数据（用于调试/监控）
 */

import { IDeviceRepository, DeviceStats } from '../../interfaces/repositories/device.repository.interface.js';

export class GetDeviceStatsUseCase {
  constructor(private deviceRepository: IDeviceRepository) {}

  /**
   * 执行获取设备统计
   * @returns 设备统计信息
   */
  async execute(): Promise<DeviceStats> {
    try {
      console.log('📊 Getting device stats...');

      const stats = await this.deviceRepository.getStats();

      console.log(`✅ Device stats retrieved: ${stats.total} devices`);

      return stats;
    } catch (error) {
      console.error('❌ Get device stats error:', error);
      throw error;
    }
  }
}

