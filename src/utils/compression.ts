/**
 * 文本压缩工具（使用浏览器原生 CompressionStream API）
 */

/**
 * 检测浏览器是否支持压缩
 */
export function isCompressionSupported(): boolean {
  return typeof CompressionStream !== 'undefined';
}

/**
 * 压缩文本
 * @param text 原始文本
 * @returns 压缩后的 Blob
 */
export async function compressText(text: string): Promise<Blob> {
  if (!isCompressionSupported()) {
    console.warn('⚠️ 浏览器不支持 CompressionStream，返回原始数据');
    return new Blob([text]);
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  
  // 使用浏览器原生 CompressionStream API
  const stream = new Blob([data]).stream();
  const compressedStream = stream.pipeThrough(
    new CompressionStream('gzip')
  );
  
  const blob = await new Response(compressedStream).blob();
  
  const ratio = ((1 - blob.size / data.length) * 100).toFixed(1);
  console.log(`📦 压缩: ${formatSize(data.length)} → ${formatSize(blob.size)} (${ratio}%)`);
  
  return blob;
}

/**
 * 计算数据的 SHA-256 hash（用于完整性校验）
 * @param data 数据
 * @returns hex格式的hash字符串
 */
export async function calculateHash(data: ArrayBuffer | Blob): Promise<string> {
  const buffer = data instanceof Blob 
    ? await data.arrayBuffer()
    : data;
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}

/**
 * 格式化文件大小
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

