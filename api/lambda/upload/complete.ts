/**
 * POST /api/upload/complete
 * 完成上传
 */

import { UploadService } from '../../services/uploadService.js';

export async function post({ data }: { data: any }) {
  const { sessionId } = data;
  
  if (!sessionId) {
    return {
      status: 400,
      data: { error: '缺少sessionId' },
    };
  }
  
  try {
    const isComplete = await UploadService.isComplete(sessionId);
    
    if (!isComplete) {
      return {
        status: 400,
        data: { error: '分片不完整，无法完成上传' },
      };
    }
    
    const assembled = await UploadService.assembleChunks(sessionId);
    
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

