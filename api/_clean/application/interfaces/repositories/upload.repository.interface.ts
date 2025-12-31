/**
 * Upload Repository Interface - 上传仓储接口
 * 
 * 职责：
 * - 定义上传数据访问层的契约
 * - 让领域层和应用层不依赖具体的存储实现
 * - 支持不同的存储技术（文件系统、对象存储、云存储等）
 */

import { UploadSessionEntity } from '../../../domain/entities/upload-session.entity.js';

export interface IUploadRepository {
  /**
   * 保存上传会话元数据
   * @param session - 上传会话实体
   */
  saveSession(session: UploadSessionEntity): Promise<void>;

  /**
   * 根据会话 ID 查找会话
   * @param sessionId - 会话 ID
   * @returns 会话实体或 null
   */
  findSessionById(sessionId: string): Promise<UploadSessionEntity | null>;

  /**
   * 保存分片数据
   * @param sessionId - 会话 ID
   * @param chunkIndex - 分片索引
   * @param chunkData - 分片数据
   * @param hash - 分片哈希值
   */
  saveChunk(
    sessionId: string,
    chunkIndex: number,
    chunkData: Buffer,
    hash: string
  ): Promise<{ verified: boolean; error?: string }>;

  /**
   * 读取分片数据
   * @param sessionId - 会话 ID
   * @param chunkIndex - 分片索引
   */
  readChunk(sessionId: string, chunkIndex: number): Promise<Buffer | null>;

  /**
   * 组装所有分片为完整文件
   * @param sessionId - 会话 ID
   * @returns 完整文件的 Buffer
   */
  assembleChunks(sessionId: string): Promise<Buffer>;

  /**
   * 删除会话及其所有分片
   * @param sessionId - 会话 ID
   */
  deleteSession(sessionId: string): Promise<void>;

  /**
   * 清理过期的会话
   * @param ttlMs - 过期时间（毫秒）
   */
  cleanupExpiredSessions(ttlMs: number): Promise<number>;
}

