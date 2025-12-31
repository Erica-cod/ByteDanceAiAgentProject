/**
 * Update User Use Case - 更新用户用例
 * 
 * 职责：
 * - 协调更新用户信息的业务流程
 * - 执行业务验证
 * - 调用仓储层更新数据
 */

import { IUserRepository } from '../../interfaces/repositories/user.repository.interface.js';

export interface UpdateUserDto {
  username?: string;
  metadata?: {
    userAgent?: string;
    firstIp?: string;
  };
}

export class UpdateUserUseCase {
  constructor(private userRepository: IUserRepository) {}

  /**
   * 执行更新用户信息
   * @param userId - 用户 ID
   * @param updates - 更新的数据
   * @returns 是否更新成功
   */
  async execute(userId: string, updates: UpdateUserDto): Promise<boolean> {
    try {
      console.log('🔄 Update user:', { userId, updates });

      if (!userId) {
        throw new Error('User ID is required');
      }

      // 检查用户是否存在
      const userExists = await this.userRepository.exists(userId);
      if (!userExists) {
        console.log('⚠️ User not found:', userId);
        return false;
      }

      // 验证更新数据
      if (updates.username !== undefined) {
        if (updates.username.trim().length === 0) {
          throw new Error('Username cannot be empty');
        }
      }

      // 准备更新数据
      const updateData: any = {
        lastActiveAt: new Date(),
      };

      if (updates.username !== undefined) {
        updateData.username = updates.username.trim();
      }

      if (updates.metadata !== undefined) {
        updateData.metadata = updates.metadata;
      }

      // 执行更新
      await this.userRepository.update(userId, updateData);

      console.log('✅ User updated successfully:', userId);
      return true;
    } catch (error) {
      console.error('❌ Update user error:', error);
      throw error;
    }
  }
}

