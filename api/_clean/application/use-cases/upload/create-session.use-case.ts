/**
 * Create Upload Session Use Case - 创建上传会话用例
 * 
 * 职责：
 * - 协调创建上传会话的业务流程
 * - 调用仓储层进行数据持久化
 */

import { IUploadRepository } from '../../interfaces/repositories/upload.repository.interface.js';
import { UploadSessionEntity } from '../../../domain/entities/upload-session.entity.js';

export class CreateSessionUseCase {
  constructor(private uploadRepository: IUploadRepository) {}

  /**
   * 执行创建上传会话
   * @param userId - 用户 ID
   * @param totalChunks - 总分片数
   * @param chunkSize - 分片大小
   * @param fileSize - 文件大小
   * @param isCompressed - 是否压缩
   * @returns 会话 ID
   */
  async execute(
    userId: string,
    totalChunks: number,
    chunkSize: number,
    fileSize: number,
    isCompressed: boolean = false
  ): Promise<string> {
    try {
      console.log('📦 Creating upload session:', { userId, totalChunks, chunkSize, fileSize, isCompressed });

      // 参数验证
      if (!userId || !totalChunks || !chunkSize || fileSize === undefined) {
        throw new Error('Missing required parameters');
      }

      if (totalChunks <= 0 || chunkSize <= 0 || fileSize < 0) {
        throw new Error('Invalid parameters');
      }

      // 创建上传会话实体
      const session = UploadSessionEntity.create(
        userId,
        totalChunks,
        chunkSize,
        fileSize,
        isCompressed
      );

      // 保存会话
      await this.uploadRepository.saveSession(session);

      console.log(`✅ Upload session created: ${session.sessionId}`);

      return session.sessionId;
    } catch (error) {
      console.error('❌ Create upload session error:', error);
      throw error;
    }
  }
}

