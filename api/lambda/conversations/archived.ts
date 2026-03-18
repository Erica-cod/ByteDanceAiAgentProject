/**
 * Archived Conversations API
 *
 * GET  /api/conversations/archived         - 获取用户的归档对话列表
 * POST /api/conversations/archived/restore - 恢复归档的对话
 */

import type { RequestOption } from '../../types/chat.js';
import { getContainer } from '../../_clean/di-container.js';
import { successResponse, errorResponse, errorResponseWithStatus } from '../_utils/response.js';
import { requireCsrf } from '../_utils/csrf.js';

// ==================== GET: 归档列表 ====================

interface GetArchivedQuery {
  userId: string;
  limit?: string;
  skip?: string;
}

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

    const limitNum = parseInt(limit, 10);
    const skipNum = parseInt(skip, 10);

    const container = getContainer();
    const getArchivedUseCase = container.getGetArchivedConversationsUseCase();
    const result = await getArchivedUseCase.execute(userId, limitNum, skipNum);

    const conversations = result.conversations.map(c => c.toPersistence());

    return successResponse(
      { conversations, total: result.total },
      undefined,
      requestOrigin
    );
  } catch (error: any) {
    console.error('❌ 获取归档对话失败:', error);
    return errorResponse(error.message || '获取归档对话失败', headers?.origin);
  }
}

// ==================== POST: 恢复归档 ====================

interface RestoreArchivedData {
  conversationId: string;
  userId: string;
}

export async function post({
  data,
  headers,
}: RequestOption<any, RestoreArchivedData>) {
  try {
    const requestOrigin = headers?.origin;

    const csrf = await requireCsrf(headers);
    if (csrf.ok === false) {
      return errorResponseWithStatus(csrf.message, csrf.status, requestOrigin);
    }

    if (!data) {
      return errorResponse('请求数据不能为空', requestOrigin);
    }

    const { conversationId, userId } = data;
    if (!conversationId || !userId) {
      return errorResponse('conversationId and userId are required', requestOrigin);
    }

    const container = getContainer();
    const unarchiveUseCase = container.getUnarchiveConversationUseCase();
    const restored = await unarchiveUseCase.execute(conversationId, userId);

    if (restored) {
      return successResponse(
        { message: '对话恢复成功', conversationId },
        undefined,
        requestOrigin
      );
    } else {
      return errorResponse('对话不存在或无法恢复', requestOrigin);
    }
  } catch (error: any) {
    console.error('❌ 恢复归档对话失败:', error);
    return errorResponse(error.message || '恢复归档对话失败', headers?.origin);
  }
}
