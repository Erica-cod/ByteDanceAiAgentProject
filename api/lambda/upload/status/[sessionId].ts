/**
 * GET /api/upload/status/:sessionId
 * 查询上传状态
 */

import { UploadService } from '../../../services/uploadService.js';

export async function get({ params }: { params: any }) {
  const { sessionId } = params;
  
  if (!sessionId) {
    return {
      status: 400,
      data: { error: '缺少sessionId' },
    };
  }
  
  try {
    const meta = await UploadService.getSessionMeta(sessionId);
    
    if (!meta) {
      return {
        status: 404,
        data: { error: '会话不存在' },
      };
    }
    
    const isComplete = await UploadService.isComplete(sessionId);
    
    return {
      status: 200,
      data: {
        sessionId: meta.sessionId,
        totalChunks: meta.totalChunks,
        uploadedChunks: meta.uploadedChunks,
        isComplete,
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

