/**
 * POST /api/upload/complete
 * 完成上传
 */

import { getContainer } from '../../_clean/di-container.js';
import type { RequestOption } from '../../types/chat.js';
import { requireCsrf } from '../_utils/csrf.js';

export async function post({ data, headers }: RequestOption<any, any>) {
  const csrf = await requireCsrf(headers);
  if (csrf.ok === false) {
    return {
      status: csrf.status,
      data: { error: csrf.message },
    };
  }

  const { sessionId } = data;
  
  if (!sessionId) {
    return {
      status: 400,
      data: { error: '缺少sessionId' },
    };
  }
  
  try {
    const container = getContainer();
    
    // 检查会话状态
    const getSessionStatusUseCase = container.getGetSessionStatusUseCase();
    const status = await getSessionStatusUseCase.execute(sessionId);
    
    if (!status || !status.isComplete) {
      return {
        status: 400,
        data: { error: '分片不完整，无法完成上传' },
      };
    }
    
    // 组装分片
    const assembleChunksUseCase = container.getAssembleChunksUseCase();
    const assembled = await assembleChunksUseCase.execute(sessionId);
    
    return {
      status: 200,
      data: {
        success: true,
        totalSize: assembled.length,
      },
    };
    
  } catch (error: any) {
    console.error('完成上传失败:', error);
    return {
      status: 500,
      data: { error: error.message || '完成上传失败' },
    };
  }
}

