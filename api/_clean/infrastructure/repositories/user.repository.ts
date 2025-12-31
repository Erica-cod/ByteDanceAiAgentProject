/**
 * MongoDB User Repository Implementation - 用户仓储 MongoDB 实现
 * 
 * 职责：
 * - 使用 MongoDB 实现用户数据的持久化
 * - 将领域实体转换为数据库格式
 * - 从数据库数据重建领域实体
 */

import { IUserRepository } from '../../application/interfaces/repositories/user.repository.interface.js';
import { UserEntity } from '../../domain/entities/user.entity.js';
import { User } from '../../../db/models.js';
import { getDatabase } from '../../../db/connection.js';

export class MongoUserRepository implements IUserRepository {
  constructor(private getDb: typeof getDatabase) {}

  /**
   * 根据用户 ID 查找用户
   */
  async findById(userId: string): Promise<UserEntity | null> {
    try {
      const db = await this.getDb();
      const collection = db.collection<User>('users');
      const user = await collection.findOne({ userId });

      if (!user) {
        return null;
      }

      return UserEntity.fromPersistence(user);
    } catch (error) {
      console.error('❌ Find user by ID error:', error);
      throw new Error(`Failed to find user: ${userId}`);
    }
  }

  /**
   * 保存用户（创建或更新）
   */
  async save(user: UserEntity): Promise<void> {
    try {
      const db = await this.getDb();
      const collection = db.collection<User>('users');
      const userData = user.toPersistence();

      // 转换数据以匹配 MongoDB User 类型（null -> undefined）
      const dbUserData: Partial<User> = {
        userId: userData.userId,
        username: userData.username ?? undefined, // null 转为 undefined
        createdAt: userData.createdAt,
        lastActiveAt: userData.lastActiveAt,
        metadata: userData.metadata ? {
          userAgent: userData.metadata.userAgent ?? undefined,
          firstIp: userData.metadata.firstIp ?? undefined,
        } : undefined,
      };

      // 使用 upsert 操作（如果存在则更新，否则创建）
      await collection.updateOne(
        { userId: dbUserData.userId },
        { $set: dbUserData },
        { upsert: true }
      );

      console.log('✅ User saved successfully:', userData.userId);
    } catch (error) {
      console.error('❌ Save user error:', error);
      throw new Error(`Failed to save user: ${user.userId}`);
    }
  }

  /**
   * 更新用户
   */
  async update(userId: string, updates: Partial<{
    username: string;
    lastActiveAt: Date;
    metadata: any;
  }>): Promise<void> {
    try {
      const db = await this.getDb();
      const collection = db.collection<User>('users');

      const result = await collection.updateOne(
        { userId },
        { $set: { ...updates, lastActiveAt: new Date() } }
      );

      if (result.matchedCount === 0) {
        throw new Error(`User not found: ${userId}`);
      }

      console.log('✅ User updated successfully:', userId);
    } catch (error) {
      console.error('❌ Update user error:', error);
      throw new Error(`Failed to update user: ${userId}`);
    }
  }

  /**
   * 删除用户
   */
  async delete(userId: string): Promise<void> {
    try {
      const db = await this.getDb();
      const collection = db.collection<User>('users');

      const result = await collection.deleteOne({ userId });

      if (result.deletedCount === 0) {
        throw new Error(`User not found: ${userId}`);
      }

      console.log('✅ User deleted successfully:', userId);
    } catch (error) {
      console.error('❌ Delete user error:', error);
      throw new Error(`Failed to delete user: ${userId}`);
    }
  }

  /**
   * 检查用户是否存在
   */
  async exists(userId: string): Promise<boolean> {
    try {
      const db = await this.getDb();
      const collection = db.collection<User>('users');
      const count = await collection.countDocuments({ userId });
      return count > 0;
    } catch (error) {
      console.error('❌ Check user exists error:', error);
      throw new Error(`Failed to check user existence: ${userId}`);
    }
  }
}

