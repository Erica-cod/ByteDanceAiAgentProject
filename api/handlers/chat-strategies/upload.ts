/**
 * 上传会话消息解析策略
 *
 * 处理分片上传 / 压缩上传的消息组装与解压
 */

import { getContainer } from '../../_clean/di-container.js';
import { gunzip } from 'zlib';
import { promisify } from 'util';

const gunzipAsync = promisify(gunzip);

export async function resolveUploadMessage(
  uploadSessionId: string,
  isCompressed: boolean | undefined,
  originalMessage: string | undefined
): Promise<string> {
  console.log(`📦 [Upload] 检测到上传会话: ${uploadSessionId}`);

  const container = getContainer();

  const assembleChunksUseCase = container.getAssembleChunksUseCase();
  const assembled = await assembleChunksUseCase.execute(uploadSessionId);
  console.log(`📦 [Upload] 组装完成: ${assembled.length} bytes`);

  let message: string;
  if (isCompressed) {
    console.log(`📦 [Upload] 正在解压...`);
    const decompressed = await gunzipAsync(assembled);
    message = decompressed.toString('utf-8');
    console.log(`📦 [Upload] 解压完成: ${message.length} 字符`);
  } else {
    message = assembled.toString('utf-8');
  }

  const cleanupSessionUseCase = container.getCleanupSessionUseCase();
  await cleanupSessionUseCase.execute(uploadSessionId);
  console.log(`📦 [Upload] 已清理临时文件`);

  return message;
}
