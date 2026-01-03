/**
 * ============================================================
 * Redis 工具函数模块
 * ============================================================
 * 
 * 提供通用的 Redis 工具函数：
 * - gzip 压缩/解压
 * - 性能监控和统计
 * 
 * ============================================================
 */

import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

// 异步化 zlib 函数
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// 性能监控接口
export interface PerformanceMetrics {
  totalWrites: number;
  totalReads: number;
  totalWriteTime: number;
  totalReadTime: number;
  totalCompressedSize: number;
  totalUncompressedSize: number;
  errors: number;
}

// 全局性能指标
const metrics: PerformanceMetrics = {
  totalWrites: 0,
  totalReads: 0,
  totalWriteTime: 0,
  totalReadTime: 0,
  totalCompressedSize: 0,
  totalUncompressedSize: 0,
  errors: 0,
};

/**
 * 压缩数据（使用 gzip）
 */
export async function compressData(data: string): Promise<Buffer> {
  const startTime = Date.now();
  const buffer = Buffer.from(data, 'utf-8');
  const compressed = await gzipAsync(buffer);
  
  // 记录性能指标
  metrics.totalUncompressedSize += buffer.length;
  metrics.totalCompressedSize += compressed.length;
  
  const compressionRatio = ((1 - compressed.length / buffer.length) * 100).toFixed(1);
  const elapsed = Date.now() - startTime;
  
  console.log(` 压缩完成: ${buffer.length} → ${compressed.length} bytes (节省 ${compressionRatio}%, 耗时 ${elapsed}ms)`);
  
  return compressed;
}

/**
 * 解压数据（使用 gunzip）
 */
export async function decompressData(buffer: Buffer): Promise<string> {
  const startTime = Date.now();
  const decompressed = await gunzipAsync(buffer);
  const elapsed = Date.now() - startTime;
  
  console.log(` 解压完成: ${buffer.length} → ${decompressed.length} bytes (耗时 ${elapsed}ms)`);
  
  return decompressed.toString('utf-8');
}

/**
 * 记录写入操作
 */
export function recordWrite(elapsedTime: number): void {
  metrics.totalWrites++;
  metrics.totalWriteTime += elapsedTime;
}

/**
 * 记录读取操作
 */
export function recordRead(elapsedTime: number): void {
  metrics.totalReads++;
  metrics.totalReadTime += elapsedTime;
}

/**
 * 记录错误
 */
export function recordError(): void {
  metrics.errors++;
}

/**
 * 获取性能统计信息
 */
export function getRedisMetrics(): PerformanceMetrics & {
  avgWriteTime: number;
  avgReadTime: number;
  compressionRatio: number;
} {
  const avgWriteTime = metrics.totalWrites > 0 
    ? Math.round(metrics.totalWriteTime / metrics.totalWrites) 
    : 0;
  
  const avgReadTime = metrics.totalReads > 0 
    ? Math.round(metrics.totalReadTime / metrics.totalReads) 
    : 0;
  
  const compressionRatio = metrics.totalUncompressedSize > 0
    ? Math.round((1 - metrics.totalCompressedSize / metrics.totalUncompressedSize) * 100)
    : 0;
  
  return {
    ...metrics,
    avgWriteTime,
    avgReadTime,
    compressionRatio,
  };
}

/**
 * 重置性能统计
 */
export function resetRedisMetrics(): void {
  metrics.totalWrites = 0;
  metrics.totalReads = 0;
  metrics.totalWriteTime = 0;
  metrics.totalReadTime = 0;
  metrics.totalCompressedSize = 0;
  metrics.totalUncompressedSize = 0;
  metrics.errors = 0;
  console.log(' Redis 性能统计已重置');
}

/**
 * 打印性能报告
 */
export function printRedisMetrics(): void {
  const stats = getRedisMetrics();
  
  console.log('\n ===== Redis 性能报告 =====');
  console.log(` 总写入次数: ${stats.totalWrites}`);
  console.log(` 总读取次数: ${stats.totalReads}`);
  console.log(` 平均写入耗时: ${stats.avgWriteTime}ms`);
  console.log(` 平均读取耗时: ${stats.avgReadTime}ms`);
  console.log(` 压缩前总大小: ${(stats.totalUncompressedSize / 1024).toFixed(2)} KB`);
  console.log(` 压缩后总大小: ${(stats.totalCompressedSize / 1024).toFixed(2)} KB`);
  console.log(` 压缩率: ${stats.compressionRatio}%`);
  console.log(` 错误次数: ${stats.errors}`);
  console.log('============================\n');
}

