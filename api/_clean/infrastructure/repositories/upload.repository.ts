/**
 * File System Upload Repository Implementation - 上传仓储文件系统实现
 * 
 * 职责：
 * - 使用文件系统实现上传数据的持久化
 * - 将领域实体转换为文件系统存储格式
 * - 从文件系统数据重建领域实体
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { IUploadRepository } from '../../application/interfaces/repositories/upload.repository.interface.js';
import { UploadSessionEntity } from '../../domain/entities/upload-session.entity.js';

export class FileSystemUploadRepository implements IUploadRepository {
  private readonly uploadDir: string;

  constructor(uploadDir?: string) {
    this.uploadDir = uploadDir || path.join(process.cwd(), '.temp', 'uploads');
  }

  /**
   * 确保上传目录存在
   */
  private async ensureUploadDir(): Promise<void> {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
    } catch (error) {
      console.error('❌ Create upload directory failed:', error);
    }
  }

  /**
   * 获取会话目录路径
   */
  private getSessionDir(sessionId: string): string {
    return path.join(this.uploadDir, sessionId);
  }

  /**
   * 获取会话元数据文件路径
   */
  private getMetaPath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), 'meta.json');
  }

  /**
   * 获取分片文件路径
   */
  private getChunkPath(sessionId: string, chunkIndex: number): string {
    return path.join(this.getSessionDir(sessionId), `chunk_${chunkIndex}`);
  }

  /**
   * 保存上传会话元数据
   */
  async saveSession(session: UploadSessionEntity): Promise<void> {
    try {
      await this.ensureUploadDir();

      const sessionDir = this.getSessionDir(session.sessionId);
      await fs.mkdir(sessionDir, { recursive: true });

      const metaData = session.toPersistence();
      await fs.writeFile(
        this.getMetaPath(session.sessionId),
        JSON.stringify(metaData, null, 2),
        'utf-8'
      );

      console.log(`✅ Upload session saved: ${session.sessionId}`);
    } catch (error) {
      console.error('❌ Save upload session error:', error);
      throw new Error(`Failed to save upload session: ${session.sessionId}`);
    }
  }

  /**
   * 根据会话 ID 查找会话
   */
  async findSessionById(sessionId: string): Promise<UploadSessionEntity | null> {
    try {
      const metaPath = this.getMetaPath(sessionId);
      const metaJson = await fs.readFile(metaPath, 'utf-8');
      const metaData = JSON.parse(metaJson);
      return UploadSessionEntity.fromPersistence(metaData);
    } catch (error) {
      return null;
    }
  }

  /**
   * 保存分片数据
   */
  async saveChunk(
    sessionId: string,
    chunkIndex: number,
    chunkData: Buffer,
    hash: string
  ): Promise<{ verified: boolean; error?: string }> {
    try {
      // 读取会话元数据
      const session = await this.findSessionById(sessionId);
      if (!session) {
        return { verified: false, error: 'Session not found' };
      }

      // 检查分片索引是否有效
      if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
        return { verified: false, error: `Invalid chunk index: ${chunkIndex}` };
      }

      // 计算分片hash
      const calculatedHash = crypto.createHash('sha256').update(chunkData).digest('hex');

      // 校验hash
      if (calculatedHash !== hash) {
        console.error(`❌ Chunk ${chunkIndex} hash verification failed`);
        return { verified: false, error: 'Hash verification failed' };
      }

      // 保存分片文件
      const chunkPath = this.getChunkPath(sessionId, chunkIndex);
      await fs.writeFile(chunkPath, chunkData);

      // 更新会话元数据
      session.markChunkUploaded(chunkIndex, hash);
      await this.saveSession(session);

      console.log(`✅ Chunk ${chunkIndex}/${session.totalChunks} saved and verified`);

      return { verified: true };
    } catch (error) {
      console.error(`❌ Save chunk error:`, error);
      return { verified: false, error: 'Save failed' };
    }
  }

  /**
   * 读取分片数据
   */
  async readChunk(sessionId: string, chunkIndex: number): Promise<Buffer | null> {
    try {
      const chunkPath = this.getChunkPath(sessionId, chunkIndex);
      return await fs.readFile(chunkPath);
    } catch (error) {
      console.error(`❌ Read chunk error:`, error);
      return null;
    }
  }

  /**
   * 组装所有分片为完整文件
   */
  async assembleChunks(sessionId: string): Promise<Buffer> {
    const session = await this.findSessionById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (!session.isComplete()) {
      throw new Error('Chunks incomplete');
    }

    console.log(`🔄 Assembling ${session.totalChunks} chunks...`);

    const chunks: Buffer[] = [];

    for (let i = 0; i < session.totalChunks; i++) {
      const chunk = await this.readChunk(sessionId, i);
      if (!chunk) {
        throw new Error(`Chunk ${i} not found`);
      }
      chunks.push(chunk);
    }

    const assembled = Buffer.concat(chunks);

    console.log(`✅ Assembly complete: ${this.formatSize(assembled.length)}`);

    return assembled;
  }

  /**
   * 删除会话及其所有分片
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      const sessionDir = this.getSessionDir(sessionId);
      await fs.rm(sessionDir, { recursive: true, force: true });
      console.log(`🗑️ Session deleted: ${sessionId}`);
    } catch (error) {
      console.error(`❌ Delete session error:`, error);
    }
  }

  /**
   * 清理过期的会话
   */
  async cleanupExpiredSessions(ttlMs: number): Promise<number> {
    try {
      await this.ensureUploadDir();

      const sessions = await fs.readdir(this.uploadDir);
      let cleanedCount = 0;

      for (const sessionId of sessions) {
        const session = await this.findSessionById(sessionId);
        if (session && session.isExpired(ttlMs)) {
          await this.deleteSession(sessionId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(`🗑️ Cleaned ${cleanedCount} expired sessions`);
      }

      return cleanedCount;
    } catch (error) {
      console.error(`❌ Cleanup expired sessions error:`, error);
      return 0;
    }
  }

  /**
   * 格式化文件大小
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  }
}

