/**
 * Conversations API - 符合 Modern.js BFF 规范
 * 路由: /api/conversations
 */

// 加载环境变量
import '../config/env.js';
import type { RequestOption } from '../types/chat.js';
import { connectToDatabase } from '../db/connection.js';
import { ConversationService } from '../services/conversationService.js';
import { successResponse, errorResponse } from './_utils/response.js';

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
 * POST /api/conversations - 创建新对话
 * 
 * @param data - 请求数据 { userId, title? }
 * @returns 创建的对话信息
 */
export async function post({
  data,
}: RequestOption<any, CreateConversationData>) {
  try {
    const { userId, title } = data;

    // 参数验证
    if (!userId) {
      return errorResponse('userId is required');
    }

    // 创建对话
    const conversation = await ConversationService.createConversation(userId, title);

    return successResponse({ conversation });
  } catch (error: any) {
    console.error('❌ Create conversation error:', error);
    return errorResponse(error.message || 'Failed to create conversation');
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
}: RequestOption<GetConversationsQuery, any>) {
  try {
    const { userId, limit = '20', skip = '0' } = query;

    // 参数验证
    if (!userId) {
      return errorResponse('userId is required');
    }

    // 查询对话列表
    const result = await ConversationService.getUserConversations(
      userId,
      parseInt(limit, 10),
      parseInt(skip, 10)
    );

    return successResponse({
      conversations: result.conversations,
      total: result.total
    });
  } catch (error: any) {
    console.error('❌ Get conversations error:', error);
    return errorResponse(error.message || 'Failed to get conversations');
  }
}

