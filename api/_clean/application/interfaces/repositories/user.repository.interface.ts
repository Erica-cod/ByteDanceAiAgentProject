/**
 * User Repository Interface - 用户仓储接口
 * 
 * 职责：
 * - 定义用户数据访问层的契约
 * - 让领域层和应用层不依赖具体的数据访问实现
 * - 支持不同的持久化技术（MongoDB、MySQL、内存等）
 */

import { UserEntity } from '../../../domain/entities/user.entity.js';

export interface IUserRepository {
  /**
   * 根据用户 ID 查找用户
   * @param userId - 用户 ID
   * @returns 用户实体或 null
   */
  findById(userId: string): Promise<UserEntity | null>;

  /**
   * 保存用户（创建或更新）
   * @param user - 用户实体
   */
  save(user: UserEntity): Promise<void>;

  /**
   * 更新用户
   * @param userId - 用户 ID
   * @param updates - 更新的字段
   */
  update(userId: string, updates: Partial<{
    username: string;
    lastActiveAt: Date;
    metadata: any;
  }>): Promise<void>;

  /**
   * 删除用户
   * @param userId - 用户 ID
   */
  delete(userId: string): Promise<void>;

  /**
   * 检查用户是否存在
   * @param userId - 用户 ID
   * @returns 是否存在
   */
  exists(userId: string): Promise<boolean>;
}

