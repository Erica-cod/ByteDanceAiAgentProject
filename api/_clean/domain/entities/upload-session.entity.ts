/**
 * Upload Session Entity - 上传会话实体
 * 
 * 职责：
 * - 封装上传会话的核心业务逻辑和数据
 * - 管理分片上传状态
 * - 验证分片完整性
 * - 提供业务方法（如标记分片已上传、检查是否完成等）
 */

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// 定义上传会话属性的 Schema
const UploadSessionPropsSchema = z.object({
  sessionId: z.string().uuid(),
  userId: z.string(),
  totalChunks: z.number().int().positive(),
  chunkSize: z.number().int().positive(),
  fileSize: z.number().int().nonnegative(),
  isCompressed: z.boolean(),
  uploadedChunks: z.array(z.number().int().nonnegative()),
  chunkHashes: z.record(z.string(), z.string()), // Record<chunkIndex, hash>
  createdAt: z.date(),
  updatedAt: z.date(),
});

type UploadSessionProps = z.infer<typeof UploadSessionPropsSchema>;

/**
 * 上传会话实体类
 */
export class UploadSessionEntity {
  private constructor(private props: UploadSessionProps) {}

  /**
   * 创建新上传会话实体
   */
  static create(
    userId: string,
    totalChunks: number,
    chunkSize: number,
    fileSize: number,
    isCompressed: boolean = false
  ): UploadSessionEntity {
    const sessionId = uuidv4();
    const now = new Date();

    const props: UploadSessionProps = {
      sessionId,
      userId,
      totalChunks,
      chunkSize,
      fileSize,
      isCompressed,
      uploadedChunks: [],
      chunkHashes: {},
      createdAt: now,
      updatedAt: now,
    };

    UploadSessionPropsSchema.parse(props); // 验证
    return new UploadSessionEntity(props);
  }

  /**
   * 从持久化数据重建上传会话实体
   */
  static fromPersistence(data: any): UploadSessionEntity {
    const parsedProps = UploadSessionPropsSchema.parse({
      ...data,
      createdAt: data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt),
      updatedAt: data.updatedAt instanceof Date ? data.updatedAt : new Date(data.updatedAt),
    });
    return new UploadSessionEntity(parsedProps);
  }

  /**
   * 转换为持久化数据格式
   */
  toPersistence(): UploadSessionProps {
    return { ...this.props };
  }

  // ==================== Getters ====================

  get sessionId() { return this.props.sessionId; }
  get userId() { return this.props.userId; }
  get totalChunks() { return this.props.totalChunks; }
  get chunkSize() { return this.props.chunkSize; }
  get fileSize() { return this.props.fileSize; }
  get isCompressed() { return this.props.isCompressed; }
  get uploadedChunks() { return [...this.props.uploadedChunks]; } // 返回副本
  get chunkHashes() { return { ...this.props.chunkHashes }; } // 返回副本
  get createdAt() { return this.props.createdAt; }
  get updatedAt() { return this.props.updatedAt; }

  // ==================== 业务方法 ====================

  /**
   * 标记分片已上传
   * @param chunkIndex - 分片索引
   * @param hash - 分片哈希值
   */
  markChunkUploaded(chunkIndex: number, hash: string): void {
    if (chunkIndex < 0 || chunkIndex >= this.props.totalChunks) {
      throw new Error(`Invalid chunk index: ${chunkIndex}`);
    }

    if (!this.props.uploadedChunks.includes(chunkIndex)) {
      this.props.uploadedChunks.push(chunkIndex);
      this.props.uploadedChunks.sort((a, b) => a - b);
    }

    this.props.chunkHashes[chunkIndex.toString()] = hash;
    this.props.updatedAt = new Date();
  }

  /**
   * 检查分片是否已上传
   * @param chunkIndex - 分片索引
   */
  isChunkUploaded(chunkIndex: number): boolean {
    return this.props.uploadedChunks.includes(chunkIndex);
  }

  /**
   * 获取分片的哈希值
   * @param chunkIndex - 分片索引
   */
  getChunkHash(chunkIndex: number): string | undefined {
    return this.props.chunkHashes[chunkIndex.toString()];
  }

  /**
   * 检查是否所有分片都已上传
   */
  isComplete(): boolean {
    return this.props.uploadedChunks.length === this.props.totalChunks;
  }

  /**
   * 获取上传进度（百分比）
   */
  getProgress(): number {
    return Math.round((this.props.uploadedChunks.length / this.props.totalChunks) * 100);
  }

  /**
   * 检查会话是否过期
   * @param ttlMs - 过期时间（毫秒）
   */
  isExpired(ttlMs: number = 60 * 60 * 1000): boolean {
    const age = Date.now() - this.props.updatedAt.getTime();
    return age > ttlMs;
  }

  /**
   * 获取缺失的分片索引列表
   */
  getMissingChunks(): number[] {
    const missing: number[] = [];
    for (let i = 0; i < this.props.totalChunks; i++) {
      if (!this.props.uploadedChunks.includes(i)) {
        missing.push(i);
      }
    }
    return missing;
  }
}

