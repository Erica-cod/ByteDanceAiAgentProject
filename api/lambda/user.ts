/**
 * User Management API - 符合 Modern.js BFF 规范
 * 路由: /api/user
 * 
 * ✅ 使用 Clean Architecture
 */

// 加载环境变量
import '../config/env.js';
import type { RequestOption } from '../types/chat.js';
import { connectToDatabase } from '../db/connection.js';
import { successResponse, errorResponse, errorResponseWithStatus } from './_utils/response.js';
import { getContainer } from '../_clean/di-container.js';
import { handleOptionsRequest } from './_utils/cors.js';
import { requireCsrf } from './_utils/csrf.js';
import { getBffSessionFromHeaders } from './_utils/bffOidcAuth.js';

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
 * OPTIONS /api/user - 处理预检请求
 */
export async function options({ headers }: RequestOption<any, any>) {
  const origin = headers?.origin;
  return handleOptionsRequest(origin);
}

/**
 * POST /api/user - 获取或创建用户
 * 
 * @param data - 请求数据 { userId, metadata? }
 * @returns 用户信息
 */
export async function post({
  data,
  headers,
}: RequestOption<any, CreateUserData>) {
  try {
    const requestOrigin = headers?.origin;

    const csrf = await requireCsrf(headers);
    if (csrf.ok === false) {
      return errorResponseWithStatus(csrf.message, csrf.status, requestOrigin);
    }
    
    // ✅ 类型检查：确保 data 存在
    if (!data) {
      return errorResponse('请求数据不能为空', requestOrigin);
    }
    
    let { userId, metadata } = data;
    const session = await getBffSessionFromHeaders(headers);
    if (session?.user?.sub) {
      userId = session.user.sub;
    }

    // 参数验证
    if (!userId) {
      return errorResponse('userId is required', requestOrigin);
    }

    // ✅ Clean Architecture
    const container = getContainer();
    const getOrCreateUserUseCase = container.getGetOrCreateUserUseCase();
    
    const userEntity = await getOrCreateUserUseCase.execute(userId, metadata);
    
    return successResponse({
      userId: userEntity.userId,
      createdAt: userEntity.createdAt,
      lastActiveAt: userEntity.lastActiveAt
    }, undefined, requestOrigin);
  } catch (error: any) {
    console.error('❌ User POST API error:', error);
    const requestOrigin = (error as any).requestOrigin;
    return errorResponse(error.message || 'Failed to process user request', requestOrigin);
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
  headers,
}: RequestOption<GetUserQuery, any>) {
  try {
    const requestOrigin = headers?.origin;
    
    // ✅ 类型检查：确保 query 存在
    if (!query) {
      return errorResponse('查询参数不能为空', requestOrigin);
    }
    
    let { userId } = query;
    const session = await getBffSessionFromHeaders(headers);
    if (session?.user?.sub) {
      userId = session.user.sub;
    }

    // 参数验证
    if (!userId) {
      return errorResponse('userId is required', requestOrigin);
    }

    // ✅ Clean Architecture
    const container = getContainer();
    const getUserByIdUseCase = container.getGetUserByIdUseCase();
    
    const userEntity = await getUserByIdUseCase.execute(userId);

    if (!userEntity) {
      return errorResponse('User not found', requestOrigin);
    }

    return successResponse({
      userId: userEntity.userId,
      username: userEntity.username,
      createdAt: userEntity.createdAt,
      lastActiveAt: userEntity.lastActiveAt
    }, undefined, requestOrigin);
  } catch (error: any) {
    console.error('❌ User GET API error:', error);
    const requestOrigin = (error as any).requestOrigin;
    return errorResponse(error.message || 'Failed to get user', requestOrigin);
  }
}

