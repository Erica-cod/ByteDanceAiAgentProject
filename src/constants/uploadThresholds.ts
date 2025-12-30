/**
 * 大文本上传阈值配置
 */

export const UPLOAD_THRESHOLDS = {
  // 直接上传：< 10KB
  DIRECT_UPLOAD_MAX: 10 * 1024,
  
  // 压缩上传：10KB - 5MB
  COMPRESSION_MAX: 5 * 1024 * 1024,
  
  // 绝对上限：10MB（超过会警告用户）
  ABSOLUTE_MAX: 10 * 1024 * 1024,
  
  // 分片大小：50KB（模型友好的大小）
  // 这样分片后端可以直接传给模型，无需重新分片
  CHUNK_SIZE: 50 * 1024,
  
  // 压缩后如果 > 5MB 才分片
  COMPRESSED_CHUNK_THRESHOLD: 5 * 1024 * 1024,
} as const;

/**
 * 上传策略类型
 */
export type UploadStrategy = 
  | 'direct'       // 直接上传
  | 'compression'  // 压缩上传
  | 'chunking'     // 压缩+分片上传
  | 'too-large';   // 太大，需要用户确认

/**
 * 上传策略决策结果
 */
export interface UploadStrategyResult {
  strategy: UploadStrategy;
  warning?: string;
  requiresConfirmation: boolean;
  estimatedSize?: number;
}

