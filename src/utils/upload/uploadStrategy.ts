/**
 * 上传策略选择器
 */

import { 
  UPLOAD_THRESHOLDS, 
  UploadStrategy, 
  UploadStrategyResult 
} from '../../constants/uploadThresholds';
import { isCompressionSupported } from './compression';

/**
 * 选择上传策略
 * @param text 要上传的文本
 * @returns 上传策略决策结果
 */
export function selectUploadStrategy(text: string): UploadStrategyResult {
  const size = text.length;
  
  // 小文本：直接上传
  if (size < UPLOAD_THRESHOLDS.DIRECT_UPLOAD_MAX) {
    return {
      strategy: 'direct',
      requiresConfirmation: false,
      estimatedSize: size,
    };
  }
  
  // 超大文本：警告用户
  if (size > UPLOAD_THRESHOLDS.ABSOLUTE_MAX) {
    return {
      strategy: 'too-large',
      warning: `文本过大（${formatSize(size)}），建议简化内容后再发送，以确保最佳处理效果。`,
      requiresConfirmation: true,
      estimatedSize: size,
    };
  }
  
  // 检查是否支持压缩
  if (!isCompressionSupported()) {
    console.warn('⚠️ 浏览器不支持压缩，使用直接上传');
    return {
      strategy: 'direct',
      warning: '浏览器不支持压缩，正在直接上传...',
      requiresConfirmation: false,
      estimatedSize: size,
    };
  }
  
  // 中等文本：压缩上传
  if (size < UPLOAD_THRESHOLDS.COMPRESSION_MAX) {
    const estimatedCompressed = size * 0.3; // 估计压缩率70%
    return {
      strategy: 'compression',
      warning: `文本较大（${formatSize(size)}），正在压缩上传...`,
      requiresConfirmation: false,
      estimatedSize: estimatedCompressed,
    };
  }
  
  // 大文本：先压缩，再判断是否需要分片
  const estimatedCompressedSize = size * 0.3; // 估计压缩率70%
  
  if (estimatedCompressedSize < UPLOAD_THRESHOLDS.COMPRESSED_CHUNK_THRESHOLD) {
    return {
      strategy: 'compression',
      warning: `文本很大（${formatSize(size)}），正在压缩上传...`,
      requiresConfirmation: false,
      estimatedSize: estimatedCompressedSize,
    };
  }
  
  // 压缩后仍然很大：分片上传
  const totalChunks = Math.ceil(estimatedCompressedSize / UPLOAD_THRESHOLDS.CHUNK_SIZE);
  return {
    strategy: 'chunking',
    warning: `文本非常大（${formatSize(size)}），将分片上传（约 ${totalChunks} 个分片）...`,
    requiresConfirmation: false,
    estimatedSize: estimatedCompressedSize,
  };
}

/**
 * 格式化文件大小
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * 显示上传策略的友好描述
 */
export function getStrategyDescription(strategy: UploadStrategy): string {
  switch (strategy) {
    case 'direct':
      return '直接上传';
    case 'compression':
      return '压缩上传';
    case 'chunking':
      return '分片上传';
    case 'too-large':
      return '文本过大';
    default:
      return '未知策略';
  }
}

