/**
 * User Management API - 符合 Modern.js BFF 规范
 * 路由: /api/user
 */

// 加载环境变量
import '../config/env.js';
import type { RequestOption } from '../types/chat.js';
import { connectToDatabase } from '../db/connection.js';
import { UserService } from '../services/userService.js';
import { successResponse, errorResponse } from './_utils/response.js';
import { USE_CLEAN_ARCH } from './_utils/arch-switch.js';
import { getContainer } from '../_clean/di-container.js';

// Initialize database connection
connectToDatabase().catch(console.error);

// ============= 类型定义 =============

interface CreateUserData {
  userId: string;
  metadata?: Record<string, any>;
}

interface GetUserQuery {
  userId: string;
}

// ============= API 函数 =============

/**
 * POST /api/user - 获取或创建用户
 * 
 * @param data - 请求数据 { userId, metadata? }
 * @returns 用户信息
 */
export async function post({
  data,
}: RequestOption<any, CreateUserData>) {
  try {
    const { userId, metadata } = data;

    // 参数验证
    if (!userId) {
      return errorResponse('userId is required');
    }

    if (USE_CLEAN_ARCH) {
      console.log('🆕 Using Clean Architecture for get or create user');
      const container = getContainer();
      const getOrCreateUserUseCase = container.getGetOrCreateUserUseCase();
      
      const userEntity = await getOrCreateUserUseCase.execute(userId, metadata);
      
      return successResponse({
        userId: userEntity.userId,
        createdAt: userEntity.createdAt,
        lastActiveAt: userEntity.lastActiveAt
      });
    } else {
      console.log('🔧 Using legacy service for get or create user');
      // 获取或创建用户
      const user = await UserService.getOrCreateUser(userId, metadata);

      return successResponse({
        userId: user.userId,
        createdAt: user.createdAt,
        lastActiveAt: user.lastActiveAt
      });
    }
  } catch (error: any) {
    console.error('❌ User POST API error:', error);
    return errorResponse(error.message || 'Failed to process user request');
  }
}

/**
 * GET /api/user - 获取用户资料
 * 
 * @param query - 查询参数 { userId }
 * @returns 用户信息
 */
export async function get({
  query,
}: RequestOption<GetUserQuery, any>) {
  try {
    const { userId } = query;

    // 参数验证
    if (!userId) {
      return errorResponse('userId is required');
    }

    if (USE_CLEAN_ARCH) {
      console.log('🆕 Using Clean Architecture for get user by ID');
      const container = getContainer();
      const getUserByIdUseCase = container.getGetUserByIdUseCase();
      
      const userEntity = await getUserByIdUseCase.execute(userId);

      if (!userEntity) {
        return errorResponse('User not found');
      }

      return successResponse({
        userId: userEntity.userId,
        username: userEntity.username,
        createdAt: userEntity.createdAt,
        lastActiveAt: userEntity.lastActiveAt
      });
    } else {
      console.log('🔧 Using legacy service for get user by ID');
      // 查询用户
      const user = await UserService.getUserById(userId);

      if (!user) {
        return errorResponse('User not found');
      }

      return successResponse({
        userId: user.userId,
        username: user.username,
        createdAt: user.createdAt,
        lastActiveAt: user.lastActiveAt
      });
    }
  } catch (error: any) {
    console.error('❌ User GET API error:', error);
    return errorResponse(error.message || 'Failed to get user');
  }
}

