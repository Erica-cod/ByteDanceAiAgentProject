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

    // 获取或创建用户
    const user = await UserService.getOrCreateUser(userId, metadata);

    return successResponse({
      userId: user.userId,
      createdAt: user.createdAt,
      lastActiveAt: user.lastActiveAt
    });
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
  } catch (error: any) {
    console.error('❌ User GET API error:', error);
    return errorResponse(error.message || 'Failed to get user');
  }
}

