/**
 * 上传服务（支持分片上传、hash校验、断点续传）
 * 
 * 设计说明：
 * - 使用文件系统存储分片（支持断点续传）
 * - 每个上传会话有一个临时目录
 * - 支持hash校验确保数据完整性
 * - 自动清理过期会话
 */

import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

/**
 * 上传会话元数据
 */
interface UploadSessionMeta {
  sessionId: string;
  userId: string;
  totalChunks: number;
  chunkSize: number;
  fileSize: number;
  isCompressed: boolean;
  uploadedChunks: number[];
  chunkHashes: Record<number, string>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 上传服务
 */
export class UploadService {
  // 临时上传目录
  private static readonly UPLOAD_DIR = path.join(process.cwd(), '.temp', 'uploads');
  
  // 会话过期时间：1小时
  private static readonly SESSION_TTL = 60 * 60 * 1000;
  
  /**
   * 确保上传目录存在
   */
  private static async ensureUploadDir(): Promise<void> {
    try {
      await fs.mkdir(this.UPLOAD_DIR, { recursive: true });
    } catch (error) {
      console.error('创建上传目录失败:', error);
    }
  }
  
  /**
   * 获取会话目录路径
   */
  private static getSessionDir(sessionId: string): string {
    return path.join(this.UPLOAD_DIR, sessionId);
  }
  
  /**
   * 获取会话元数据文件路径
   */
  private static getMetaPath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), 'meta.json');
  }
  
  /**
   * 获取分片文件路径
   */
  private static getChunkPath(sessionId: string, chunkIndex: number): string {
    return path.join(this.getSessionDir(sessionId), `chunk_${chunkIndex}`);
  }
  
  /**
   * 创建上传会话
   */
  static async createSession(
    userId: string,
    totalChunks: number,
    chunkSize: number,
    fileSize: number,
    isCompressed: boolean = false
  ): Promise<string> {
    await this.ensureUploadDir();
    
    const sessionId = uuidv4();
    const sessionDir = this.getSessionDir(sessionId);
    
    // 创建会话目录
    await fs.mkdir(sessionDir, { recursive: true });
    
    // 创建元数据
    const meta: UploadSessionMeta = {
      sessionId,
      userId,
      totalChunks,
      chunkSize,
      fileSize,
      isCompressed,
      uploadedChunks: [],
      chunkHashes: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    // 保存元数据
    await fs.writeFile(
      this.getMetaPath(sessionId),
      JSON.stringify(meta, null, 2),
      'utf-8'
    );
    
    console.log(`📦 [Upload] 创建会话: ${sessionId}, ${totalChunks}个分片, ${this.formatSize(fileSize)}`);
    
    return sessionId;
  }
  
  /**
   * 保存分片（带hash校验）
   */
  static async saveChunk(
    sessionId: string,
    chunkIndex: number,
    chunk: Buffer,
    hash: string
  ): Promise<{ verified: boolean; error?: string }> {
    try {
      // 读取元数据
      const meta = await this.getSessionMeta(sessionId);
      if (!meta) {
        return { verified: false, error: '会话不存在' };
      }
      
      // 检查分片索引是否有效
      if (chunkIndex < 0 || chunkIndex >= meta.totalChunks) {
        return { verified: false, error: `分片索引无效: ${chunkIndex}` };
      }
      
      // 计算分片hash
      const calculatedHash = crypto.createHash('sha256').update(chunk).digest('hex');
      
      // 校验hash
      if (calculatedHash !== hash) {
        console.error(`❌ [Upload] 分片${chunkIndex} hash校验失败`);
        return { verified: false, error: 'hash校验失败' };
      }
      
      // 保存分片文件
      const chunkPath = this.getChunkPath(sessionId, chunkIndex);
      await fs.writeFile(chunkPath, chunk);
      
      // 更新元数据
      if (!meta.uploadedChunks.includes(chunkIndex)) {
        meta.uploadedChunks.push(chunkIndex);
        meta.uploadedChunks.sort((a, b) => a - b);
      }
      meta.chunkHashes[chunkIndex] = hash;
      meta.updatedAt = new Date();
      
      await fs.writeFile(
        this.getMetaPath(sessionId),
        JSON.stringify(meta, null, 2),
        'utf-8'
      );
      
      console.log(`✅ [Upload] 分片${chunkIndex}/${meta.totalChunks} 已保存并校验`);
      
      return { verified: true };
      
    } catch (error) {
      console.error(`❌ [Upload] 保存分片失败:`, error);
      return { verified: false, error: '保存失败' };
    }
  }
  
  /**
   * 获取会话元数据
   */
  static async getSessionMeta(sessionId: string): Promise<UploadSessionMeta | null> {
    try {
      const metaPath = this.getMetaPath(sessionId);
      const metaJson = await fs.readFile(metaPath, 'utf-8');
      return JSON.parse(metaJson);
    } catch (error) {
      return null;
    }
  }
  
  /**
   * 获取已上传的分片列表
   */
  static async getUploadedChunks(sessionId: string): Promise<number[]> {
    const meta = await this.getSessionMeta(sessionId);
    return meta?.uploadedChunks || [];
  }
  
  /**
   * 检查是否完成
   */
  static async isComplete(sessionId: string): Promise<boolean> {
    const meta = await this.getSessionMeta(sessionId);
    if (!meta) return false;
    
    return meta.uploadedChunks.length === meta.totalChunks;
  }
  
  /**
   * 组装分片为完整文件
   */
  static async assembleChunks(sessionId: string): Promise<Buffer> {
    const meta = await this.getSessionMeta(sessionId);
    if (!meta) {
      throw new Error('会话不存在');
    }
    
    if (!await this.isComplete(sessionId)) {
      throw new Error('分片不完整');
    }
    
    console.log(`🔄 [Upload] 开始组装${meta.totalChunks}个分片...`);
    
    const chunks: Buffer[] = [];
    
    for (let i = 0; i < meta.totalChunks; i++) {
      const chunkPath = this.getChunkPath(sessionId, i);
      const chunk = await fs.readFile(chunkPath);
      chunks.push(chunk);
    }
    
    const assembled = Buffer.concat(chunks);
    
    console.log(`✅ [Upload] 组装完成: ${this.formatSize(assembled.length)}`);
    
    return assembled;
  }
  
  /**
   * 清理会话（删除临时文件）
   */
  static async cleanupSession(sessionId: string): Promise<void> {
    try {
      const sessionDir = this.getSessionDir(sessionId);
      await fs.rm(sessionDir, { recursive: true, force: true });
      console.log(`🗑️ [Upload] 清理会话: ${sessionId}`);
    } catch (error) {
      console.error(`❌ [Upload] 清理会话失败:`, error);
    }
  }
  
  /**
   * 清理过期会话
   */
  static async cleanupExpiredSessions(): Promise<void> {
    try {
      await this.ensureUploadDir();
      
      const sessions = await fs.readdir(this.UPLOAD_DIR);
      const now = Date.now();
      let cleanedCount = 0;
      
      for (const sessionId of sessions) {
        const meta = await this.getSessionMeta(sessionId);
        if (meta) {
          const age = now - new Date(meta.updatedAt).getTime();
          if (age > this.SESSION_TTL) {
            await this.cleanupSession(sessionId);
            cleanedCount++;
          }
        }
      }
      
      if (cleanedCount > 0) {
        console.log(`🗑️ [Upload] 清理了${cleanedCount}个过期会话`);
      }
    } catch (error) {
      console.error(`❌ [Upload] 清理过期会话失败:`, error);
    }
  }
  
  /**
   * 格式化文件大小
   */
  private static formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  }
}

// 定期清理过期会话（每小时一次）
setInterval(() => {
  UploadService.cleanupExpiredSessions();
}, 60 * 60 * 1000);

