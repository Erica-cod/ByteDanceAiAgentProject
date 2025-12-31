/**
 * Get or Create User Use Case - 获取或创建用户用例
 * 
 * 职责：
 * - 协调获取或创建用户的业务流程
 * - 调用仓储层进行数据持久化
 * - 确保用户始终存在
 */

import { IUserRepository } from '../../interfaces/repositories/user.repository.interface.js';
import { UserEntity } from '../../../domain/entities/user.entity.js';

export class GetOrCreateUserUseCase {
  constructor(private userRepository: IUserRepository) {}

  /**
   * 执行获取或创建用户
   * @param userId - 用户 ID（可选，如果不提供则生成新的）
   * @param metadata - 用户元数据（可选）
   * @returns 用户实体
   */
  async execute(userId?: string, metadata?: any): Promise<UserEntity> {
    try {
      console.log('🔍 Get or create user:', { userId, hasMetadata: !!metadata });

      // 如果提供了 userId，先尝试查找
      if (userId) {
        const existingUser = await this.userRepository.findById(userId);
        
        if (existingUser) {
          console.log('✅ User found, updating last active time');
          // 更新最后活跃时间
          existingUser.updateLastActive();
          await this.userRepository.save(existingUser);
          return existingUser;
        }
      }

      // 创建新用户
      console.log('✨ Creating new user');
      const newUser = UserEntity.create(userId, metadata);
      await this.userRepository.save(newUser);

      return newUser;
    } catch (error) {
      console.error('❌ Get or create user error:', error);
      throw error;
    }
  }
}

