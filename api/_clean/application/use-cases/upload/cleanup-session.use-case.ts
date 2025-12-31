/**
 * Cleanup Session Use Case - 清理会话用例
 * 
 * 职责：
 * - 协调清理上传会话的业务流程
 * - 删除会话及其所有分片
 */

import { IUploadRepository } from '../../interfaces/repositories/upload.repository.interface.js';

export class CleanupSessionUseCase {
  constructor(private uploadRepository: IUploadRepository) {}

  /**
   * 执行清理单个会话
   * @param sessionId - 会话 ID
   */
  async execute(sessionId: string): Promise<void> {
    try {
      console.log('🗑️ Cleaning up session:', sessionId);

      // 参数验证
      if (!sessionId) {
        throw new Error('Session ID is required');
      }

      // 删除会话
      await this.uploadRepository.deleteSession(sessionId);

      console.log(`✅ Session cleaned up: ${sessionId}`);
    } catch (error) {
      console.error('❌ Cleanup session error:', error);
      throw error;
    }
  }

  /**
   * 执行清理过期会话
   * @param ttlMs - 过期时间（毫秒）
   * @returns 清理的会话数量
   */
  async cleanupExpired(ttlMs: number = 60 * 60 * 1000): Promise<number> {
    try {
      console.log(`🗑️ Cleaning up expired sessions (TTL: ${ttlMs}ms)...`);

      const cleanedCount = await this.uploadRepository.cleanupExpiredSessions(ttlMs);

      if (cleanedCount > 0) {
        console.log(`✅ Cleaned up ${cleanedCount} expired sessions`);
      }

      return cleanedCount;
    } catch (error) {
      console.error('❌ Cleanup expired sessions error:', error);
      throw error;
    }
  }
}

