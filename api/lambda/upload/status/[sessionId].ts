/**
 * GET /api/upload/status/:sessionId
 * 查询上传状态
 */

import { UploadService } from '../../../services/uploadService.js';
import { USE_CLEAN_ARCH } from '../../_utils/arch-switch.js';
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
    if (USE_CLEAN_ARCH) {
      console.log('🆕 Using Clean Architecture for get session status');
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
    } else {
      console.log('🔧 Using legacy service for get session status');
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
    }
    
  } catch (error: any) {
    console.error('查询上传状态失败:', error);
    return {
      status: 500,
      data: { error: error.message || '查询失败' },
    };
  }
}

