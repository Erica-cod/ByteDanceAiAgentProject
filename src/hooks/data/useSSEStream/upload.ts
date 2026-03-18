/**
 * 上传相关逻辑
 * 处理文本上传、压缩上传、分片上传等
 */

import { selectUploadStrategy } from '@/utils/upload/uploadStrategy';
import { compressText } from '@/utils/upload/compression';
import { ChunkUploader } from '@/utils/upload/chunkUploader';
import { fetchWithCsrf } from '@/utils/auth/fetchWithCsrf';
import type { UploadPayload } from './types';

/**
 * 上传压缩的 blob（单次请求，无分片）
 */
export async function uploadCompressedBlob(blob: Blob, userId: string): Promise<string> {
  const formData = new FormData();
  formData.append('userId', userId);
  formData.append('data', blob);
  formData.append('isCompressed', 'true');

  const response = await fetchWithCsrf('/api/upload/compressed', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`压缩上传失败: ${response.status}`);
  }

  const result = await response.json();
  return result.sessionId;
}

/**
 * 处理消息上传策略
 * 根据消息大小选择合适的上传方式：直接、压缩、分片
 */
export async function handleMessageUpload(
  messageText: string,
  userId: string,
  options: {
    updateProgress: (thinking: string) => void;
    markFailed: () => void;
  }
): Promise<UploadPayload> {
  const uploadDecision = selectUploadStrategy(messageText);
  console.log(`📦 [Upload] 策略: ${uploadDecision.strategy}`, uploadDecision);

  // 如果文本太大，询问用户是否继续
  if (uploadDecision.strategy === 'too-large' && uploadDecision.requiresConfirmation) {
    const confirmed = window.confirm(
      uploadDecision.warning + '\n\n是否继续发送？'
    );
    if (!confirmed) {
      throw new Error('用户取消发送');
    }
  }

  // 上传进度提示
  if (uploadDecision.warning) {
    options.updateProgress(uploadDecision.warning);
  }

  // 根据策略处理上传
  let uploadPayload: UploadPayload = {};

  if (uploadDecision.strategy === 'direct' || uploadDecision.strategy === 'too-large') {
    // 直接上传
    uploadPayload.message = messageText;
    
  } else if (uploadDecision.strategy === 'compression') {
    // 压缩上传
    options.updateProgress('正在压缩文本...');
    
    const compressedBlob = await compressText(messageText);
    
    uploadPayload = {
      uploadSessionId: await uploadCompressedBlob(compressedBlob, userId),
      isCompressed: true,
    };
    
  } else if (uploadDecision.strategy === 'chunking') {
    // 分片上传
    const compressedBlob = await compressText(messageText);
    
    try {
      const sessionId = await ChunkUploader.uploadLargeBlob(compressedBlob, {
        userId,
        onProgress: (percent, uploaded, total) => {
          options.updateProgress(`上传中... ${percent}% (${uploaded}/${total} 个分片)`);
        },
        onError: (error, chunkIndex) => {
          console.error(`分片 ${chunkIndex} 上传失败:`, error);
        },
      });
      
      uploadPayload = {
        uploadSessionId: sessionId,
        isCompressed: true,
      };
      
      options.updateProgress('上传完成，正在处理...');
      
    } catch (error: any) {
      // 上传失败
      options.markFailed();
      throw error;
    }
  }

  return uploadPayload;
}

