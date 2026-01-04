/**
 * Archived Conversations API - 归档对话管理
 * 
 * GET /api/conversations/archived - 获取用户的归档对话列表
 * POST /api/conversations/archived/restore - 恢复归档的对话
 */

import type { RequestOption } from '../../types/chat.js';
import { getDatabase } from '../../db/connection.js';
import type { Conversation } from '../../db/models.js';
import { getConversationLRUService } from '../../services/conversationLRUService.js';
import { requireCsrf } from '../_utils/csrf.js';

// ==================== 响应工具函数 ====================

function successResponse(data: any, requestOrigin?: string) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': requestOrigin || '*',
      'Access-Control-Allow-Credentials': 'true',
    },
    body: JSON.stringify({
      success: true,
      data,
    }),
  };
}

function errorResponse(message: string, requestOrigin?: string) {
  return {
    statusCode: 400,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': requestOrigin || '*',
      'Access-Control-Allow-Credentials': 'true',
    },
    body: JSON.stringify({
      success: false,
      error: message,
    }),
  };
}

// ==================== API 端点 ====================

interface GetArchivedQuery {
  userId: string;
  limit?: string;
  skip?: string;
}

/**
 * GET /api/conversations/archived - 获取归档对话列表
 */
export async function get({
  query,
  headers,
}: RequestOption<GetArchivedQuery, any>) {
  try {
    const requestOrigin = headers?.origin;

    if (!query) {
      return errorResponse('查询参数不能为空', requestOrigin);
    }

    const { userId, limit = '20', skip = '0' } = query;

    if (!userId) {
      return errorResponse('userId is required', requestOrigin);
    }

    const db = await getDatabase();
    const collection = db.collection<Conversation>('conversations');

    const limitNum = parseInt(limit, 10);
    const skipNum = parseInt(skip, 10);

    // 查询归档对话
    const conversations = await collection
      .find({ userId, isArchived: true })
      .sort({ archivedAt: -1 }) // 最近归档的排前面
      .limit(limitNum)
      .skip(skipNum)
      .toArray();

    const total = await collection.countDocuments({ userId, isArchived: true });

    return successResponse({
      conversations,
      total,
    }, requestOrigin);
  } catch (error: any) {
    console.error('❌ 获取归档对话失败:', error);
    const requestOrigin = (error as any).requestOrigin;
    return errorResponse(error.message || '获取归档对话失败', requestOrigin);
  }
}

interface RestoreArchivedData {
  conversationId: string;
  userId: string;
}

/**
 * POST /api/conversations/archived/restore - 恢复归档的对话
 */
export async function post({
  data,
  headers,
}: RequestOption<any, RestoreArchivedData>) {
  try {
    const requestOrigin = headers?.origin;

    const csrf = await requireCsrf(headers);
    if (csrf.ok === false) {
      return {
        statusCode: csrf.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': requestOrigin || '*',
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ success: false, error: csrf.message }),
      };
    }

    if (!data) {
      return errorResponse('请求数据不能为空', requestOrigin);
    }

    const { conversationId, userId } = data;

    if (!conversationId || !userId) {
      return errorResponse('conversationId and userId are required', requestOrigin);
    }

    // 使用 LRU 服务恢复对话
    const lruService = getConversationLRUService();
    const success = await lruService.restoreArchivedConversation(conversationId, userId);

    if (success) {
      return successResponse({
        message: '对话恢复成功',
        conversationId,
      }, requestOrigin);
    } else {
      return errorResponse('对话不存在或无法恢复', requestOrigin);
    }
  } catch (error: any) {
    console.error('❌ 恢复归档对话失败:', error);
    const requestOrigin = (error as any).requestOrigin;
    return errorResponse(error.message || '恢复归档对话失败', requestOrigin);
  }
}

