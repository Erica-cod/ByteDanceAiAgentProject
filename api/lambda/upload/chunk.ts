/**
 * POST /api/upload/chunk
 * 上传单个分片
 */

import { UploadService } from '../../services/uploadService.js';

export async function post({ data }: { data: any }) {
  try {
    // 如果是 FormData，需要解析
    const formData = data instanceof FormData ? data : data;
    
    const sessionId = formData.get ? formData.get('sessionId') : data.sessionId;
    const chunkIndex = formData.get ? parseInt(formData.get('chunkIndex')) : parseInt(data.chunkIndex);
    const hash = formData.get ? formData.get('hash') : data.hash;
    const chunkBlob = formData.get ? formData.get('chunk') : data.chunk;
    
    if (!sessionId || chunkIndex === undefined || !hash || !chunkBlob) {
      return {
        status: 400,
        data: { error: '缺少必需参数' },
      };
    }
    
    // 转换为 Buffer
    let chunkBuffer: Buffer;
    if (chunkBlob instanceof Blob) {
      const arrayBuffer = await chunkBlob.arrayBuffer();
      chunkBuffer = Buffer.from(arrayBuffer);
    } else if (Buffer.isBuffer(chunkBlob)) {
      chunkBuffer = chunkBlob;
    } else {
      return {
        status: 400,
        data: { error: '分片数据格式错误' },
      };
    }
    
    // 保存分片
    const result = await UploadService.saveChunk(
      sessionId,
      chunkIndex,
      chunkBuffer,
      hash
    );
    
    if (!result.verified) {
      return {
        status: 400,
        data: { 
          error: result.error || 'hash校验失败',
          verified: false,
        },
      };
    }
    
    const uploadedChunks = await UploadService.getUploadedChunks(sessionId);
    
    return {
      status: 200,
      data: {
        success: true,
        verified: true,
        uploadedCount: uploadedChunks.length,
      },
    };
    
  } catch (error: any) {
    console.error('上传分片失败:', error);
    return {
      status: 500,
      data: { error: error.message || '上传失败' },
    };
  }
}

