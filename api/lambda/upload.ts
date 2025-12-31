/**
 * POST /api/upload/session
 * 创建上传会话
 */

import { UploadService } from '../services/uploadService.js';
import { USE_CLEAN_ARCH } from './_utils/arch-switch.js';
import { getContainer } from '../_clean/di-container.js';

export async function post({ data }: { data: any }) {
  const { userId, totalChunks, chunkSize, fileSize, isCompressed } = data;
  
  if (!userId || !totalChunks || !chunkSize || !fileSize) {
    return {
      status: 400,
      data: { error: '缺少必需参数' },
    };
  }
  
  try {
    let sessionId: string;

    if (USE_CLEAN_ARCH) {
      console.log('🆕 Using Clean Architecture for create upload session');
      const container = getContainer();
      const createSessionUseCase = container.getCreateSessionUseCase();
      
      sessionId = await createSessionUseCase.execute(
        userId,
        totalChunks,
        chunkSize,
        fileSize,
        isCompressed || false
      );
    } else {
      console.log('🔧 Using legacy service for create upload session');
      sessionId = await UploadService.createSession(
        userId,
        totalChunks,
        chunkSize,
        fileSize,
        isCompressed || false
      );
    }
    
    return {
      status: 200,
      data: { sessionId },
    };
  } catch (error: any) {
    console.error('创建上传会话失败:', error);
    return {
      status: 500,
      data: { error: error.message || '创建会话失败' },
    };
  }
}
