/**
 * Single Conversation API - 符合 Modern.js BFF 规范
 * 路由: /api/conversations/:id
 * 
 * ✅ 使用 Clean Architecture
 */

// 加载环境变量
import '../../config/env.js';
import type { RequestOption } from '../../types/chat.js';
import { connectToDatabase } from '../../db/connection.js';

// Clean Architecture
import { getContainer } from '../../_clean/di-container.js';

// 工具
import { successResponse, errorResponse, messageResponse } from '../_utils/response.js';

// Initialize database connection
connectToDatabase().catch(console.error);

// ============= 类型定义 =============

interface ConversationQuery {
  userId: string;
  limit?: string;
  skip?: string;
}

interface UpdateConversationData {
  userId: string;
  title: string;
}

// ============= API 函数 =============

/**
 * DELETE /api/conversations/:id - 删除对话
 * 
 * @param id - 动态路由参数：对话 ID
 * @param context - 请求上下文
 * @returns 删除结果
 */
export async function del(
  id: string,
  context: any
) {
  try {
    // 防御性获取 query 参数
    const query = context.query || context.req?.query || {};
    
    let userId: string | undefined;
    if (typeof query === 'function') {
      userId = query('userId');
    } else if (typeof query === 'object') {
      userId = query.userId;
    }
    
    if (!userId && context.req?.query) {
      if (typeof context.req.query === 'function') {
        userId = context.req.query('userId');
      } else {
        userId = context.req.query.userId;
      }
    }
    
    console.log('🗑️ DELETE /api/conversations/:id - Debug:', { id, userId });

    // 参数验证
    if (!userId) {
      return errorResponse('User ID is required');
    }

    if (!id) {
      return errorResponse('Conversation ID is required');
    }

    // ✅ Clean Architecture: 删除对话
    const container = getContainer();
    const useCase = container.getDeleteConversationUseCase();
    const deleted = await useCase.execute(id, userId);

    if (!deleted) {
      return errorResponse('Conversation not found or already deleted');
    }

    return messageResponse('Conversation deleted successfully');
  } catch (error: any) {
    console.error('❌ Delete conversation error:', error);
    return errorResponse(error.message || 'Failed to delete conversation');
  }
}

/**
 * PUT /api/conversations/:id - 更新对话标题
 * 
 * @param id - 动态路由参数：对话 ID
 * @param context - 请求上下文
 * @returns 更新结果
 */
export async function put(
  id: string,
  context: any
) {
  try {
    // 防御性获取 data
    const data = context.data || context.body || context.req?.body || {};
    const { userId, title } = data;
    
    console.log('✏️ PUT /api/conversations/:id - Debug:', { id, userId, title });

    // 参数验证
    if (!userId) {
      return errorResponse('User ID is required');
    }

    if (!id) {
      return errorResponse('Conversation ID is required');
    }

    if (!title) {
      return errorResponse('Title is required');
    }

    // ✅ Clean Architecture: 更新对话标题
    const container = getContainer();
    const useCase = container.getUpdateConversationUseCase();
    const conversation = await useCase.execute(id, userId, { title });
    
    if (!conversation) {
      return errorResponse('Conversation not found');
    }

    return messageResponse('Conversation title updated successfully');
  } catch (error: any) {
    console.error('❌ Update conversation error:', error);
    return errorResponse(error.message || 'Failed to update conversation');
  }
}

/**
 * GET /api/conversations/:id - 获取对话详情（包含消息列表）
 * 
 * @param id - 动态路由参数：对话 ID
 * @param context - 请求上下文（包含 query 参数）
 * @returns 对话详情和消息列表
 */
export async function get(
  id: string,
  context: any  // 使用 any 以兼容不同的上下文对象结构
) {
  try {
    // 防御性获取 query 参数（兼容不同的上下文对象结构）
    const query = context.query || context.req?.query || {};
    
    // 从 query 中获取参数（支持多种获取方式）
    let userId: string | undefined;
    let limit: string = '500';  // 增加默认限制到 500 条消息
    let skip: string = '0';
    
    // 尝试不同的方式获取 userId
    if (typeof query === 'function') {
      // Hono 风格：query 是函数
      userId = query('userId');
      limit = query('limit') || '500';
      skip = query('skip') || '0';
    } else if (typeof query === 'object') {
      // 对象风格：query 是对象
      userId = query.userId;
      limit = query.limit || '500';
      skip = query.skip || '0';
    }
    
    // 如果还是没有，尝试从 context.req.query 获取
    if (!userId && context.req?.query) {
      if (typeof context.req.query === 'function') {
        userId = context.req.query('userId');
      } else {
        userId = context.req.query.userId;
      }
    }
    
    console.log('🔍 GET /api/conversations/:id - Debug:', {
      id,
      userId,
      limit,
      skip,
      queryType: typeof query,
      hasReqQuery: !!context.req?.query
    });

    // 参数验证
    if (!userId) {
      return errorResponse('User ID is required');
    }

    if (!id) {
      return errorResponse('Conversation ID is required');
    }

    // ✅ Clean Architecture: 获取对话
    const container = getContainer();
    const useCase = container.getGetConversationUseCase();
    const entity = await useCase.execute(id, userId);
    
    if (!entity) {
      console.error('❌ Conversation not found:', { id, userId });
      return errorResponse('Conversation not found');
    }
    
    const conversation = entity.toPersistence();
    console.log('✅ Found conversation:', conversation.title);

    // ✅ Clean Architecture: 获取消息列表
    const getMessagesUseCase = container.getGetMessagesUseCase();
    const { messages, total } = await getMessagesUseCase.execute(
      id,
      userId,
      parseInt(limit, 10),
      parseInt(skip, 10)
    );
    
    const messagesResult = {
      messages: messages.map(m => m.toPersistence()), // 转换为普通对象
      total
    };
    
    console.log('✅ Found messages:', messagesResult.messages.length);
    console.log('🔗 API 返回前检查 - 有 sources 的消息:', 
      messagesResult.messages.filter((m: any) => m.sources && m.sources.length > 0).length
    );

    return successResponse({
      conversation,
      messages: messagesResult.messages,
      total: messagesResult.total
    });
  } catch (error: any) {
    console.error('❌ Get conversation error:', error);
    return errorResponse(error.message || 'Failed to get conversation');
  }
}

