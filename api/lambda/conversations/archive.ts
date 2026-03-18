/**
 * Archive Conversation API
 *
 * POST /api/conversations/archive - 归档指定对话
 */

import type { RequestOption } from '../../types/chat.js';
import { getContainer } from '../../_clean/di-container.js';
import { successResponse, errorResponse, errorResponseWithStatus } from '../_utils/response.js';
import { requireCsrf } from '../_utils/csrf.js';

interface ArchiveConversationData {
  conversationId: string;
  userId: string;
}

export async function post({
  data,
  headers,
}: RequestOption<any, ArchiveConversationData>) {
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
    const archiveUseCase = container.getArchiveConversationUseCase();
    const archived = await archiveUseCase.execute(conversationId, userId);

    if (archived) {
      console.log(`✅ 对话已归档: ${conversationId} (用户: ${userId})`);
    }

    return successResponse(
      { message: archived ? '对话已归档' : '对话已归档或不存在', conversationId },
      undefined,
      requestOrigin
    );
  } catch (error: any) {
    console.error('❌ 归档对话失败:', error);
    return errorResponse(error.message || '归档对话失败', headers?.origin);
  }
}
