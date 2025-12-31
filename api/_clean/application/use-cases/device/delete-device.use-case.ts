/**
 * Delete Device Use Case - 删除设备用例
 * 
 * 职责：
 * - 协调删除设备的业务流程
 * - 用于用户请求删除设备（GDPR 权利）
 */

import { IDeviceRepository } from '../../interfaces/repositories/device.repository.interface.js';

export class DeleteDeviceUseCase {
  constructor(private deviceRepository: IDeviceRepository) {}

  /**
   * 执行删除设备
   * @param deviceIdHash - 设备 ID Hash
   * @returns 是否删除成功
   */
  async execute(deviceIdHash: string): Promise<boolean> {
    try {
      console.log(`🗑️ Deleting device: ${deviceIdHash.slice(0, 8)}...`);

      // 参数验证
      if (!deviceIdHash || typeof deviceIdHash !== 'string') {
        throw new Error('Invalid deviceIdHash');
      }

      // 删除设备
      const deleted = await this.deviceRepository.delete(deviceIdHash);

      if (deleted) {
        console.log(`✅ Device deleted successfully`);
      } else {
        console.log(`⚠️ Device not found: ${deviceIdHash.slice(0, 8)}...`);
      }

      return deleted;
    } catch (error) {
      console.error('❌ Delete device error:', error);
      throw error;
    }
  }
}

