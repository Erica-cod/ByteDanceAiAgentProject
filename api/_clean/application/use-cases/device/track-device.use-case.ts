/**
 * Track Device Use Case - 追踪设备用例
 * 
 * 职责：
 * - 协调追踪设备的业务流程
 * - 如果是新设备则创建，如果是已有设备则更新最后访问时间
 * - 调用仓储层进行数据持久化
 */

import { IDeviceRepository } from '../../interfaces/repositories/device.repository.interface.js';
import { DeviceEntity } from '../../../domain/entities/device.entity.js';

export class TrackDeviceUseCase {
  constructor(private deviceRepository: IDeviceRepository) {}

  /**
   * 执行追踪设备
   * @param deviceIdHash - 设备 ID Hash
   */
  async execute(deviceIdHash: string): Promise<void> {
    try {
      console.log(`🔍 Tracking device: ${deviceIdHash.slice(0, 8)}...`);

      // 参数验证
      if (!deviceIdHash || typeof deviceIdHash !== 'string') {
        throw new Error('Invalid deviceIdHash');
      }

      if (deviceIdHash.length < 16 || deviceIdHash.length > 64) {
        throw new Error('deviceIdHash length invalid');
      }

      // 查找设备
      const existingDevice = await this.deviceRepository.findByHash(deviceIdHash);

      if (existingDevice) {
        // 已有设备，更新最后访问时间
        console.log(`🔄 Updating existing device: ${deviceIdHash.slice(0, 8)}...`);
        existingDevice.updateLastSeen();
        await this.deviceRepository.save(existingDevice);
      } else {
        // 新设备
        console.log(`✨ Creating new device: ${deviceIdHash.slice(0, 8)}...`);
        const newDevice = DeviceEntity.create(deviceIdHash);
        await this.deviceRepository.save(newDevice);
      }

      console.log(`✅ Device tracked successfully`);
    } catch (error) {
      console.error('❌ Track device error:', error);
      throw error;
    }
  }
}

