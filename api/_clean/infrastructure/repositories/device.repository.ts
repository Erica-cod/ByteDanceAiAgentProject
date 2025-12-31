/**
 * In-Memory Device Repository Implementation - 设备仓储内存实现
 * 
 * 职责：
 * - 使用内存（Map）实现设备数据的存储
 * - 将领域实体转换为存储格式
 * - 从存储数据重建领域实体
 * 
 * 注意：生产环境建议使用 Redis 或数据库
 */

import { IDeviceRepository, DeviceStats } from '../../application/interfaces/repositories/device.repository.interface.js';
import { DeviceEntity } from '../../domain/entities/device.entity.js';

export class InMemoryDeviceRepository implements IDeviceRepository {
  private devices: Map<string, DeviceEntity>;

  constructor() {
    this.devices = new Map();
  }

  /**
   * 保存设备（创建或更新）
   */
  async save(device: DeviceEntity): Promise<void> {
    this.devices.set(device.deviceIdHash, device);
    console.log(`✅ Device saved: ${device.deviceIdHash.slice(0, 8)}...`);
  }

  /**
   * 根据设备 ID Hash 查找设备
   */
  async findByHash(deviceIdHash: string): Promise<DeviceEntity | null> {
    const device = this.devices.get(deviceIdHash);
    return device || null;
  }

  /**
   * 删除设备
   */
  async delete(deviceIdHash: string): Promise<boolean> {
    const deleted = this.devices.delete(deviceIdHash);
    if (deleted) {
      console.log(`🗑️ Device deleted: ${deviceIdHash.slice(0, 8)}...`);
    }
    return deleted;
  }

  /**
   * 检查设备是否存在
   */
  async exists(deviceIdHash: string): Promise<boolean> {
    return this.devices.has(deviceIdHash);
  }

  /**
   * 获取所有设备
   */
  async findAll(): Promise<DeviceEntity[]> {
    return Array.from(this.devices.values());
  }

  /**
   * 获取设备统计信息
   */
  async getStats(): Promise<DeviceStats> {
    const devices = Array.from(this.devices.values());
    const now = Date.now();

    if (devices.length === 0) {
      return { total: 0, oldest: 0, newest: 0, averageLifetime: 0 };
    }

    const createdTimes = devices.map(d => d.createdAt.getTime());
    const lifetimes = devices.map(d => now - d.createdAt.getTime());
    const averageLifetime = lifetimes.reduce((sum, t) => sum + t, 0) / lifetimes.length;

    return {
      total: devices.length,
      oldest: Math.min(...createdTimes),
      newest: Math.max(...createdTimes),
      averageLifetime: Math.round(averageLifetime / 86400000), // 转为天数
    };
  }

  /**
   * 清理过期设备
   */
  async cleanupExpired(): Promise<number> {
    let deletedCount = 0;

    for (const [hash, device] of this.devices.entries()) {
      if (device.isExpired()) {
        this.devices.delete(hash);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`🗑️ Cleaned ${deletedCount} expired devices`);
    }

    return deletedCount;
  }
}

