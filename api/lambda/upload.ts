/**
 * POST /api/upload/session
 * 创建上传会话
 * 
 * ✅ 使用 Clean Architecture
 */

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
    // ✅ Clean Architecture: 创建上传会话
    const container = getContainer();
    const createSessionUseCase = container.getCreateSessionUseCase();
    
    const sessionId = await createSessionUseCase.execute(
      userId,
      totalChunks,
      chunkSize,
      fileSize,
      isCompressed || false
    );
    
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
