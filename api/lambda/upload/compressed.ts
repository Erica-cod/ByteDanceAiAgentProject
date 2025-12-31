/**
 * POST /api/upload/compressed
 * 上传压缩文件（单次请求，不分片）
 */

import { getContainer } from '../../_clean/di-container.js';

export async function post({ data }: { data: any }) {
  try {
    const formData = data instanceof FormData ? data : data;
    
    const userId = formData.get ? formData.get('userId') : data.userId;
    const dataBlob = formData.get ? formData.get('data') : data.data;
    const isCompressed = formData.get ? formData.get('isCompressed') === 'true' : data.isCompressed;
    
    if (!userId || !dataBlob) {
      return {
        status: 400,
        data: { error: '缺少必需参数' },
      };
    }
    
    // 转换为 Buffer
    let buffer: Buffer;
    if (dataBlob instanceof Blob) {
      const arrayBuffer = await dataBlob.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else if (Buffer.isBuffer(dataBlob)) {
      buffer = dataBlob;
    } else {
      return {
        status: 400,
        data: { error: '数据格式错误' },
      };
    }
    
    const container = getContainer();
    
    // 创建一个单分片会话
    const createSessionUseCase = container.getCreateSessionUseCase();
    const sessionId = await createSessionUseCase.execute(
      userId,
      1,  // 单分片
      buffer.length,
      buffer.length,
      isCompressed
    );
    
    // 计算hash
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    
    // 保存分片
    const saveChunkUseCase = container.getSaveChunkUseCase();
    await saveChunkUseCase.execute(
      sessionId,
      0,
      buffer,
      hash
    );
    
    return {
      status: 200,
      data: { sessionId },
    };
    
  } catch (error: any) {
    console.error('压缩上传失败:', error);
    return {
      status: 500,
      data: { error: error.message || '上传失败' },
    };
  }
}

