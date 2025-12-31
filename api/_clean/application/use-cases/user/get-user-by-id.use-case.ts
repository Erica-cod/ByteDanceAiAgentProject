/**
 * Get User By ID Use Case - 根据 ID 获取用户用例
 * 
 * 职责：
 * - 协调根据 ID 获取用户的业务流程
 * - 调用仓储层查询用户
 */

import { IUserRepository } from '../../interfaces/repositories/user.repository.interface.js';
import { UserEntity } from '../../../domain/entities/user.entity.js';

export class GetUserByIdUseCase {
  constructor(private userRepository: IUserRepository) {}

  /**
   * 执行根据 ID 获取用户
   * @param userId - 用户 ID
   * @returns 用户实体或 null
   */
  async execute(userId: string): Promise<UserEntity | null> {
    try {
      console.log('🔍 Get user by ID:', userId);

      if (!userId) {
        throw new Error('User ID is required');
      }

      const user = await this.userRepository.findById(userId);

      if (!user) {
        console.log('⚠️ User not found:', userId);
        return null;
      }

      console.log('✅ User found:', userId);
      return user;
    } catch (error) {
      console.error('❌ Get user by ID error:', error);
      throw error;
    }
  }
}

