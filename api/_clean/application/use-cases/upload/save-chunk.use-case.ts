/**
 * Save Chunk Use Case - 保存分片用例
 * 
 * 职责：
 * - 协调保存分片的业务流程
 * - 执行 hash 验证
 * - 调用仓储层保存分片数据
 */

import { IUploadRepository } from '../../interfaces/repositories/upload.repository.interface.js';

export interface SaveChunkResult {
  verified: boolean;
  uploadedCount: number;
  error?: string;
}

export class SaveChunkUseCase {
  constructor(private uploadRepository: IUploadRepository) {}

  /**
   * 执行保存分片
   * @param sessionId - 会话 ID
   * @param chunkIndex - 分片索引
   * @param chunkData - 分片数据
   * @param hash - 分片哈希值
   * @returns 保存结果
   */
  async execute(
    sessionId: string,
    chunkIndex: number,
    chunkData: Buffer,
    hash: string
  ): Promise<SaveChunkResult> {
    try {
      console.log(`📤 Saving chunk ${chunkIndex} for session: ${sessionId}`);

      // 参数验证
      if (!sessionId || chunkIndex === undefined || !chunkData || !hash) {
        return { verified: false, uploadedCount: 0, error: 'Missing required parameters' };
      }

      // 保存分片
      const result = await this.uploadRepository.saveChunk(sessionId, chunkIndex, chunkData, hash);

      if (!result.verified) {
        return {
          verified: false,
          uploadedCount: 0,
          error: result.error || 'Hash verification failed',
        };
      }

      // 获取会话状态
      const session = await this.uploadRepository.findSessionById(sessionId);
      const uploadedCount = session ? session.uploadedChunks.length : 0;

      console.log(`✅ Chunk ${chunkIndex} saved, progress: ${uploadedCount}/${session?.totalChunks || 0}`);

      return {
        verified: true,
        uploadedCount,
      };
    } catch (error) {
      console.error('❌ Save chunk error:', error);
      throw error;
    }
  }
}

