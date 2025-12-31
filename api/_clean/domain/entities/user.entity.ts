/**
 * User Entity - 用户实体
 * 
 * 职责：
 * - 封装用户的核心业务逻辑和数据
 * - 确保用户数据的一致性和完整性
 * - 提供业务方法（如更新最后活跃时间）
 */

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// 定义用户元数据的 Schema
const UserMetadataSchema = z.object({
  userAgent: z.string().optional().nullable(),
  firstIp: z.string().optional().nullable(),
}).optional().nullable();

// 定义用户属性的 Schema
const UserPropsSchema = z.object({
  userId: z.string(),
  username: z.string().optional().nullable(),
  createdAt: z.date(),
  lastActiveAt: z.date(),
  metadata: UserMetadataSchema,
});

type UserProps = z.infer<typeof UserPropsSchema>;
type UserMetadata = z.infer<typeof UserMetadataSchema>;

/**
 * 用户实体类
 */
export class UserEntity {
  private constructor(private props: UserProps) {}

  /**
   * 创建新用户实体
   */
  static create(userId?: string, metadata?: UserMetadata): UserEntity {
    const id = userId || uuidv4();
    const now = new Date();

    const props: UserProps = {
      userId: id,
      username: null,
      createdAt: now,
      lastActiveAt: now,
      metadata: metadata || null,
    };

    UserPropsSchema.parse(props); // 验证
    return new UserEntity(props);
  }

  /**
   * 从持久化数据重建用户实体
   */
  static fromPersistence(data: any): UserEntity {
    const parsedProps = UserPropsSchema.parse({
      ...data,
      createdAt: data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt),
      lastActiveAt: data.lastActiveAt instanceof Date ? data.lastActiveAt : new Date(data.lastActiveAt),
    });
    return new UserEntity(parsedProps);
  }

  /**
   * 转换为持久化数据格式
   */
  toPersistence(): UserProps {
    return { ...this.props };
  }

  // ==================== Getters ====================

  get userId() { return this.props.userId; }
  get username() { return this.props.username; }
  get createdAt() { return this.props.createdAt; }
  get lastActiveAt() { return this.props.lastActiveAt; }
  get metadata() { return this.props.metadata; }

  // ==================== 业务方法 ====================

  /**
   * 更新最后活跃时间
   */
  updateLastActive(): void {
    this.props.lastActiveAt = new Date();
  }

  /**
   * 更新用户名
   */
  updateUsername(newUsername: string): void {
    if (!newUsername || newUsername.trim().length === 0) {
      throw new Error('Username cannot be empty');
    }
    this.props.username = newUsername.trim();
    this.updateLastActive();
  }

  /**
   * 更新用户元数据
   */
  updateMetadata(newMetadata: Partial<UserMetadata>): void {
    this.props.metadata = {
      ...this.props.metadata,
      ...newMetadata,
    };
    this.updateLastActive();
  }

  /**
   * 检查用户是否长时间未活跃
   */
  isInactive(inactiveDays: number = 90): boolean {
    const daysSinceLastActive = 
      (Date.now() - this.props.lastActiveAt.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceLastActive > inactiveDays;
  }
}

