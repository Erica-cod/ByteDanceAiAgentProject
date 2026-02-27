/**
 * Unarchive Conversation API - 取消归档（恢复对话）
 * 
 * POST /api/conversations/unarchive - 恢复归档的对话
 */

import type { RequestOption } from '../../types/chat.js';
import { getDatabase } from '../../db/connection.js';
import type { Conversation } from '../../db/models.js';
import { requireCsrf } from '../_utils/csrf.js';

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

interface UnarchiveConversationData {
  conversationId: string;
  userId: string;
}

/**
 * POST /api/conversations/unarchive - 恢复归档的对话
 */
export async function post({
  data,
  headers,
}: RequestOption<any, UnarchiveConversationData>) {
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

    const db = await getDatabase();
    const collection = db.collection<Conversation>('conversations');

    // 恢复对话
    const result = await collection.updateOne(
      { conversationId, userId, isArchived: true },
      {
        $set: {
          isArchived: false,
          isActive: true,
          lastAccessedAt: new Date(),
          updatedAt: new Date(),
        },
        $unset: {
          archivedAt: '',
        },
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`✅ 对话已恢复: ${conversationId} (用户: ${userId})`);
      return successResponse({
        message: '对话已恢复',
        conversationId,
      }, requestOrigin);
    } else {
      return errorResponse('对话不存在或未归档', requestOrigin);
    }
  } catch (error: any) {
    console.error('❌ 恢复对话失败:', error);
    return errorResponse(error.message || '恢复对话失败', headers?.origin);
  }
}

