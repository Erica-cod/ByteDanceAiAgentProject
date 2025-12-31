/**
 * Device Repository Interface - 设备仓储接口
 * 
 * 职责：
 * - 定义设备数据访问层的契约
 * - 让领域层和应用层不依赖具体的存储实现
 * - 支持不同的存储技术（内存、Redis、MongoDB 等）
 */

import { DeviceEntity } from '../../../domain/entities/device.entity.js';

export interface DeviceStats {
  total: number;
  oldest: number;
  newest: number;
  averageLifetime: number;
}

export interface IDeviceRepository {
  /**
   * 保存设备（创建或更新）
   * @param device - 设备实体
   */
  save(device: DeviceEntity): Promise<void>;

  /**
   * 根据设备 ID Hash 查找设备
   * @param deviceIdHash - 设备 ID Hash
   * @returns 设备实体或 null
   */
  findByHash(deviceIdHash: string): Promise<DeviceEntity | null>;

  /**
   * 删除设备
   * @param deviceIdHash - 设备 ID Hash
   * @returns 是否删除成功
   */
  delete(deviceIdHash: string): Promise<boolean>;

  /**
   * 检查设备是否存在
   * @param deviceIdHash - 设备 ID Hash
   * @returns 是否存在
   */
  exists(deviceIdHash: string): Promise<boolean>;

  /**
   * 获取所有设备
   * @returns 设备实体数组
   */
  findAll(): Promise<DeviceEntity[]>;

  /**
   * 获取设备统计信息
   * @returns 统计信息
   */
  getStats(): Promise<DeviceStats>;

  /**
   * 清理过期设备
   * @returns 清理的设备数量
   */
  cleanupExpired(): Promise<number>;
}

