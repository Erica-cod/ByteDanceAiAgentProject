/**
 * GET /api/upload/status/:sessionId
 * 查询上传状态
 * 
 * ✅ 使用 Clean Architecture
 */

import { getContainer } from '../../../_clean/di-container.js';

export async function get({ params }: { params: any }) {
  const { sessionId } = params;
  
  if (!sessionId) {
    return {
      status: 400,
      data: { error: '缺少sessionId' },
    };
  }
  
  try {
    // ✅ Clean Architecture
    const container = getContainer();
    const getSessionStatusUseCase = container.getGetSessionStatusUseCase();
    
    const status = await getSessionStatusUseCase.execute(sessionId);
    
    if (!status) {
      return {
        status: 404,
        data: { error: '会话不存在' },
      };
    }
    
    return {
      status: 200,
      data: {
        sessionId: status.sessionId,
        totalChunks: status.totalChunks,
        uploadedChunks: status.uploadedChunks,
        isComplete: status.isComplete,
        progress: status.progress,
      },
    };
    
  } catch (error: any) {
    console.error('查询上传状态失败:', error);
    return {
      status: 500,
      data: { error: error.message || '查询失败' },
    };
  }
}

