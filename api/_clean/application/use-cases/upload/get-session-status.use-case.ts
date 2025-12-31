/**
 * Get Session Status Use Case - 获取会话状态用例
 * 
 * 职责：
 * - 协调获取上传会话状态的业务流程
 * - 返回会话信息和上传进度
 */

import { IUploadRepository } from '../../interfaces/repositories/upload.repository.interface.js';

export interface SessionStatus {
  sessionId: string;
  totalChunks: number;
  uploadedChunks: number[];
  isComplete: boolean;
  progress: number;
}

export class GetSessionStatusUseCase {
  constructor(private uploadRepository: IUploadRepository) {}

  /**
   * 执行获取会话状态
   * @param sessionId - 会话 ID
   * @returns 会话状态
   */
  async execute(sessionId: string): Promise<SessionStatus | null> {
    try {
      console.log('🔍 Getting session status:', sessionId);

      // 参数验证
      if (!sessionId) {
        throw new Error('Session ID is required');
      }

      // 查找会话
      const session = await this.uploadRepository.findSessionById(sessionId);

      if (!session) {
        console.log('⚠️ Session not found:', sessionId);
        return null;
      }

      // 构建状态响应
      const status: SessionStatus = {
        sessionId: session.sessionId,
        totalChunks: session.totalChunks,
        uploadedChunks: session.uploadedChunks,
        isComplete: session.isComplete(),
        progress: session.getProgress(),
      };

      console.log(`✅ Session status retrieved: ${status.progress}% complete`);

      return status;
    } catch (error) {
      console.error('❌ Get session status error:', error);
      throw error;
    }
  }
}

