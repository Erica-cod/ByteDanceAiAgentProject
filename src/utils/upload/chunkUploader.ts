/**
 * 分片上传器（支持hash校验、断点续传、失败重试）
 */

import { UPLOAD_THRESHOLDS } from '@/constants/uploadThresholds';
import { calculateHash } from './compression';
import { fetchWithCsrf } from '../auth/fetchWithCsrf';

/**
 * 分片元数据
 */
interface ChunkMetadata {
  index: number;
  size: number;
  hash: string;
  offset: number;
}

/**
 * 上传会话状态
 */
interface UploadSessionStatus {
  sessionId: string;
  totalChunks: number;
  uploadedChunks: number[];
  isComplete: boolean;
  failedChunks: number[];
}

/**
 * 上传选项
 */
interface UploadOptions {
  userId: string;
  onProgress?: (percent: number, uploaded: number, total: number) => void;
  onChunkComplete?: (chunkIndex: number, totalChunks: number) => void;
  onError?: (error: Error, chunkIndex?: number) => void;
  maxRetries?: number;  // 每个分片最大重试次数
  existingSessionId?: string;  // 断点续传的会话ID
}

/**
 * 分片上传器
 */
export class ChunkUploader {
  private static readonly CHUNK_SIZE = UPLOAD_THRESHOLDS.CHUNK_SIZE;
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 1000; // 1秒

  /**
   * 上传大 Blob（支持分片、hash校验、断点续传）
   */
  static async uploadLargeBlob(
    blob: Blob,
    options: UploadOptions
  ): Promise<string> {
    const {
      userId,
      onProgress,
      onChunkComplete,
      onError,
      maxRetries = this.MAX_RETRIES,
      existingSessionId,
    } = options;

    const totalChunks = Math.ceil(blob.size / this.CHUNK_SIZE);
    
    console.log(`📦 开始分片上传: ${totalChunks} 个分片，总大小 ${this.formatSize(blob.size)}`);
    
    let sessionId: string;
    let uploadedChunks: number[] = [];
    
    // 检查是否有已有会话（断点续传）
    if (existingSessionId) {
      try {
        const status = await this.getUploadStatus(existingSessionId);
        if (status && !status.isComplete) {
          sessionId = existingSessionId;
          uploadedChunks = status.uploadedChunks;
          console.log(`🔄 续传: 已上传 ${uploadedChunks.length}/${totalChunks} 个分片`);
        } else {
          sessionId = await this.createSession(userId, totalChunks, blob.size);
        }
      } catch (error) {
        console.warn('⚠️ 获取会话状态失败，创建新会话', error);
        sessionId = await this.createSession(userId, totalChunks, blob.size);
      }
    } else {
      sessionId = await this.createSession(userId, totalChunks, blob.size);
    }
    
    // 上传所有分片
    const failedChunks: number[] = [];
    
    for (let i = 0; i < totalChunks; i++) {
      // 跳过已上传的分片
      if (uploadedChunks.includes(i)) {
        console.log(`⏭️ 跳过分片 ${i + 1}/${totalChunks}`);
        onProgress?.(
          Math.round(((i + 1) / totalChunks) * 100),
          i + 1,
          totalChunks
        );
        continue;
      }
      
      const start = i * this.CHUNK_SIZE;
      const end = Math.min(start + this.CHUNK_SIZE, blob.size);
      const chunk = blob.slice(start, end);
      
      try {
        // 计算分片hash
        const hash = await calculateHash(chunk);
        
        // 上传分片（带重试）
        await this.uploadChunkWithRetry(
          sessionId,
          i,
          chunk,
          hash,
          maxRetries
        );
        
        onChunkComplete?.(i, totalChunks);
        onProgress?.(
          Math.round(((i + 1) / totalChunks) * 100),
          i + 1,
          totalChunks
        );
        
      } catch (error) {
        console.error(`❌ 分片 ${i + 1}/${totalChunks} 上传失败:`, error);
        failedChunks.push(i);
        onError?.(error as Error, i);
        
        // 如果失败的分片太多，直接取消整个上传
        if (failedChunks.length > Math.max(1, totalChunks * 0.1)) {
          throw new Error(
            `上传失败：${failedChunks.length} 个分片失败。` +
            `内容可能太大，请尝试减少内容后重新发送。`
          );
        }
      }
    }
    
    // 如果有失败的分片，抛出错误
    if (failedChunks.length > 0) {
      throw new Error(
        `上传失败：${failedChunks.length} 个分片失败（分片索引：${failedChunks.join(', ')}）。` +
        `请检查网络连接或尝试减少内容后重新发送。`
      );
    }
    
    // 完成上传
    await this.completeUpload(sessionId);
    
    console.log(`✅ 分片上传完成: sessionId=${sessionId}`);
    
    return sessionId;
  }
  
  /**
   * 创建上传会话
   */
  private static async createSession(
    userId: string,
    totalChunks: number,
    fileSize: number
  ): Promise<string> {
    const response = await fetchWithCsrf('/api/upload/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        totalChunks,
        fileSize,
        chunkSize: this.CHUNK_SIZE,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`创建上传会话失败: ${response.status}`);
    }
    
    const data = await response.json();
    return data.sessionId;
  }
  
  /**
   * 上传单个分片（带重试）
   */
  private static async uploadChunkWithRetry(
    sessionId: string,
    chunkIndex: number,
    chunk: Blob,
    hash: string,
    maxRetries: number
  ): Promise<void> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`🔄 重试分片 ${chunkIndex}，第 ${attempt}/${maxRetries} 次...`);
          await this.delay(this.RETRY_DELAY * attempt);
        }
        
        await this.uploadChunk(sessionId, chunkIndex, chunk, hash);
        return; // 成功，退出
        
      } catch (error) {
        lastError = error as Error;
        console.warn(`⚠️ 分片 ${chunkIndex} 第 ${attempt + 1} 次尝试失败:`, error);
      }
    }
    
    // 所有重试都失败了
    throw new Error(
      `分片 ${chunkIndex} 上传失败（重试 ${maxRetries} 次后仍失败）: ${lastError?.message}`
    );
  }
  
  /**
   * 上传单个分片
   */
  private static async uploadChunk(
    sessionId: string,
    chunkIndex: number,
    chunk: Blob,
    hash: string
  ): Promise<void> {
    const formData = new FormData();
    formData.append('sessionId', sessionId);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('chunk', chunk);
    formData.append('hash', hash);
    
    const response = await fetchWithCsrf('/api/upload/chunk', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `上传分片失败: ${response.status}`
      );
    }
    
    const data = await response.json();
    
    // 服务器会返回hash校验结果
    if (!data.verified) {
      throw new Error('分片hash校验失败');
    }
  }
  
  /**
   * 获取上传状态
   */
  private static async getUploadStatus(
    sessionId: string
  ): Promise<UploadSessionStatus | null> {
    const response = await fetch(`/api/upload/status/${sessionId}`);
    
    if (!response.ok) {
      return null;
    }
    
    return response.json();
  }
  
  /**
   * 完成上传
   */
  private static async completeUpload(sessionId: string): Promise<void> {
    const response = await fetchWithCsrf('/api/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `完成上传失败: ${response.status}`
      );
    }
  }
  
  /**
   * 延迟函数
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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

