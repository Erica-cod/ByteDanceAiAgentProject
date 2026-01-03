/**
 * Archive Conversation API - 归档对话（前端驱动）
 * 
 * POST /api/conversations/archive - 归档指定对话
 * POST /api/conversations/unarchive - 取消归档
 */

import type { RequestOption } from '../../types/chat.js';
import { getDatabase } from '../../db/connection.js';
import type { Conversation } from '../../db/models.js';

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

interface ArchiveConversationData {
  conversationId: string;
  userId: string;
}

/**
 * POST /api/conversations/archive - 归档对话
 * 前端在清理 LocalStorage 缓存时调用此接口
 */
export async function post({
  data,
  headers,
}: RequestOption<any, ArchiveConversationData>) {
  try {
    const requestOrigin = headers?.origin;

    if (!data) {
      return errorResponse('请求数据不能为空', requestOrigin);
    }

    const { conversationId, userId } = data;

    if (!conversationId || !userId) {
      return errorResponse('conversationId and userId are required', requestOrigin);
    }

    const db = await getDatabase();
    const collection = db.collection<Conversation>('conversations');

    // 归档对话
    const result = await collection.updateOne(
      { conversationId, userId, isActive: true },
      {
        $set: {
          isArchived: true,
          archivedAt: new Date(),
          isActive: false,
          updatedAt: new Date(),
        },
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`✅ 对话已归档: ${conversationId} (用户: ${userId})`);
      return successResponse({
        message: '对话已归档',
        conversationId,
      }, requestOrigin);
    } else {
      // 对话不存在或已归档
      return successResponse({
        message: '对话已归档或不存在',
        conversationId,
      }, requestOrigin);
    }
  } catch (error: any) {
    console.error('❌ 归档对话失败:', error);
    return errorResponse(error.message || '归档对话失败', headers?.origin);
  }
}

