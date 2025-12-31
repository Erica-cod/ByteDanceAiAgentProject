/**
 * Device Entity - 设备实体
 * 
 * 职责：
 * - 封装设备的核心业务逻辑和数据
 * - 管理设备生命周期（创建、更新、过期）
 * - 确保设备数据的一致性和完整性
 * - 实现 GDPR 存储限制原则（30 天 TTL）
 */

import { z } from 'zod';

// 定义设备属性的 Schema
const DevicePropsSchema = z.object({
  deviceIdHash: z.string().min(16).max(64), // SHA-256 Hash
  createdAt: z.date(),
  lastSeen: z.date(),
  expiresAt: z.date(),
});

type DeviceProps = z.infer<typeof DevicePropsSchema>;

/**
 * 设备实体类
 */
export class DeviceEntity {
  // 设备 TTL（30 天）
  private static readonly DEVICE_TTL_MS = 30 * 24 * 3600 * 1000;

  private constructor(private props: DeviceProps) {}

  /**
   * 创建新设备实体
   */
  static create(deviceIdHash: string): DeviceEntity {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.DEVICE_TTL_MS);

    const props: DeviceProps = {
      deviceIdHash,
      createdAt: now,
      lastSeen: now,
      expiresAt,
    };

    DevicePropsSchema.parse(props); // 验证
    return new DeviceEntity(props);
  }

  /**
   * 从持久化数据重建设备实体
   */
  static fromPersistence(data: any): DeviceEntity {
    const parsedProps = DevicePropsSchema.parse({
      ...data,
      createdAt: data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt),
      lastSeen: data.lastSeen instanceof Date ? data.lastSeen : new Date(data.lastSeen),
      expiresAt: data.expiresAt instanceof Date ? data.expiresAt : new Date(data.expiresAt),
    });
    return new DeviceEntity(parsedProps);
  }

  /**
   * 转换为持久化数据格式
   */
  toPersistence(): DeviceProps {
    return { ...this.props };
  }

  // ==================== Getters ====================

  get deviceIdHash() { return this.props.deviceIdHash; }
  get createdAt() { return this.props.createdAt; }
  get lastSeen() { return this.props.lastSeen; }
  get expiresAt() { return this.props.expiresAt; }

  // ==================== 业务方法 ====================

  /**
   * 更新最后访问时间（活跃设备）
   * 同时延长过期时间（GDPR 要求）
   */
  updateLastSeen(): void {
    const now = new Date();
    this.props.lastSeen = now;
    this.props.expiresAt = new Date(now.getTime() + DeviceEntity.DEVICE_TTL_MS);
  }

  /**
   * 检查设备是否已过期
   */
  isExpired(): boolean {
    return Date.now() > this.props.expiresAt.getTime();
  }

  /**
   * 获取设备年龄（天数）
   */
  getAgeInDays(): number {
    const age = Date.now() - this.props.createdAt.getTime();
    return Math.round(age / (24 * 3600 * 1000));
  }

  /**
   * 获取距离上次访问的天数
   */
  getDaysSinceLastSeen(): number {
    const elapsed = Date.now() - this.props.lastSeen.getTime();
    return Math.round(elapsed / (24 * 3600 * 1000));
  }

  /**
   * 获取剩余有效天数
   */
  getRemainingDays(): number {
    const remaining = this.props.expiresAt.getTime() - Date.now();
    return Math.max(0, Math.round(remaining / (24 * 3600 * 1000)));
  }
}

