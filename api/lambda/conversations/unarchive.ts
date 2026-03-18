/**
 * Unarchive Conversation API
 *
 * POST /api/conversations/unarchive - 恢复归档的对话
 */

import type { RequestOption } from '../../types/chat.js';
import { getContainer } from '../../_clean/di-container.js';
import { successResponse, errorResponse, errorResponseWithStatus } from '../_utils/response.js';
import { requireCsrf } from '../_utils/csrf.js';

interface UnarchiveConversationData {
  conversationId: string;
  userId: string;
}

export async function post({
  data,
  headers,
}: RequestOption<any, UnarchiveConversationData>) {
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
      console.log(`✅ 对话已恢复: ${conversationId} (用户: ${userId})`);
      return successResponse(
        { message: '对话已恢复', conversationId },
        undefined,
        requestOrigin
      );
    } else {
      return errorResponse('对话不存在或未归档', requestOrigin);
    }
  } catch (error: any) {
    console.error('❌ 恢复对话失败:', error);
    return errorResponse(error.message || '恢复对话失败', headers?.origin);
  }
}
