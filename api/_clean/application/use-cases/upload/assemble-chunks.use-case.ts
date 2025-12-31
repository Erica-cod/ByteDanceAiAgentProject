/**
 * Assemble Chunks Use Case - 组装分片用例
 * 
 * 职责：
 * - 协调组装分片为完整文件的业务流程
 * - 验证所有分片是否完整
 * - 调用仓储层组装文件
 */

import { IUploadRepository } from '../../interfaces/repositories/upload.repository.interface.js';

export class AssembleChunksUseCase {
  constructor(private uploadRepository: IUploadRepository) {}

  /**
   * 执行组装分片
   * @param sessionId - 会话 ID
   * @returns 完整文件的 Buffer
   */
  async execute(sessionId: string): Promise<Buffer> {
    try {
      console.log('🔄 Assembling chunks for session:', sessionId);

      // 参数验证
      if (!sessionId) {
        throw new Error('Session ID is required');
      }

      // 查找会话
      const session = await this.uploadRepository.findSessionById(sessionId);

      if (!session) {
        throw new Error('Session not found');
      }

      // 检查是否完成
      if (!session.isComplete()) {
        const missing = session.getMissingChunks();
        throw new Error(`Chunks incomplete. Missing: ${missing.join(', ')}`);
      }

      // 组装分片
      const assembledData = await this.uploadRepository.assembleChunks(sessionId);

      console.log(`✅ Chunks assembled successfully: ${assembledData.length} bytes`);

      return assembledData;
    } catch (error) {
      console.error('❌ Assemble chunks error:', error);
      throw error;
    }
  }
}

