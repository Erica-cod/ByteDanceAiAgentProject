/**
 * Conversations API - 符合 Modern.js BFF 规范
 * 路由: /api/conversations
 * 
 * ✅ 使用 Clean Architecture
 */

// 加载环境变量
import '../config/env.js';
import type { RequestOption } from '../types/chat.js';
import { connectToDatabase } from '../db/connection.js';

// Clean Architecture
import { getContainer } from '../_clean/di-container.js';

// 工具
import { successResponse, errorResponse, errorResponseWithStatus } from './_utils/response.js';
import { handleOptionsRequest } from './_utils/cors.js';
import { requireCsrf } from './_utils/csrf.js';
import { getBffSessionFromHeaders } from './_utils/bffOidcAuth.js';

// Initialize database connection
connectToDatabase().catch(console.error);

// ============= 类型定义 =============

interface CreateConversationData {
  userId: string;
  title?: string;
}

interface GetConversationsQuery {
  userId: string;
  limit?: string;
  skip?: string;
}

// ============= API 函数 =============

/**
 * OPTIONS /api/conversations - 处理预检请求
 */
export async function options({ headers }: RequestOption<any, any>) {
  const origin = headers?.origin;
  return handleOptionsRequest(origin);
}

/**
 * POST /api/conversations - 创建新对话
 * 
 * @param data - 请求数据 { userId, title? }
 * @returns 创建的对话信息
 */
export async function post({
  data,
  headers,
}: RequestOption<any, CreateConversationData>) {
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
    
    let { userId, title } = data;
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
    const useCase = container.getCreateConversationUseCase();
    const entity = await useCase.execute(userId, title);
    const conversation = entity.toPersistence();

    return successResponse({ conversation }, undefined, requestOrigin);
  } catch (error: any) {
    console.error('❌ Create conversation error:', error);
    const requestOrigin = (error as any).requestOrigin;
    return errorResponse(error.message || 'Failed to create conversation', requestOrigin);
  }
}

/**
 * GET /api/conversations - 获取用户的对话列表
 * 
 * @param query - 查询参数 { userId, limit?, skip? }
 * @returns 对话列表和总数
 */
export async function get({
  query,
  headers,
}: RequestOption<GetConversationsQuery, any>) {
  try {
    const requestOrigin = headers?.origin;
    
    // ✅ 类型检查：确保 query 存在
    if (!query) {
      return errorResponse('查询参数不能为空', requestOrigin);
    }
    
    let { userId, limit = '20', skip = '0' } = query;
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
    const useCase = container.getGetConversationsUseCase();
    const useCaseResult = await useCase.execute(
      userId,
      parseInt(limit, 10),
      parseInt(skip, 10)
    );
    
    // 转换为持久化格式（保持 API 兼容性）
    const result = {
      conversations: useCaseResult.conversations.map(entity => entity.toPersistence()),
      total: useCaseResult.total
    };

    return successResponse({
      conversations: result.conversations,
      total: result.total
    }, undefined, requestOrigin);
  } catch (error: any) {
    console.error('❌ Get conversations error:', error);
    const requestOrigin = (error as any).requestOrigin;
    return errorResponse(error.message || 'Failed to get conversations', requestOrigin);
  }
}

