/**
 * ============================================================
 * ⚠️ 已弃用：Redis 客户端工具类（保留用于学习参考）
 * ============================================================
 * 
 * 为什么弃用：
 * - 多 Agent 状态保存已迁移到 MongoDB
 * - 原因：低频操作（6.7次/秒）、需要持久化、数据规模小且可预测
 * - MongoDB 性能完全够用（300倍富余量），且提供更好的持久化和查询能力
 * 
 * 何时需要 Redis：
 * - 高频操作（数千次/秒以上）
 * - 需要极致性能（亚毫秒级响应）
 * - 临时数据缓存（不需要持久化）
 * 
 * 详见：docs/ARCHITECTURE_DECISION.md
 * 
 * ============================================================
 * 原功能说明（保留用于参考）：
 * - 用于多 agent 状态缓存和断点续传
 * - gzip 压缩存储（节省 60-80% 内存）
 * - 异步写入（Fire and Forget，避免阻塞）
 * - 动态 TTL（根据会话进度调整过期时间）
 * - 滑动过期（访问时自动续期）
 * - 性能监控（记录读写耗时、压缩率）
 * ============================================================
 */

import Redis from 'ioredis';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

// 异步化 zlib 函数
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// Redis 配置
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

// 是否启用压缩（默认开启）
const ENABLE_COMPRESSION = process.env.REDIS_COMPRESSION !== 'false';

// 是否启用异步写入（默认开启，生产环境建议开启以提升性能）
const ENABLE_ASYNC_WRITE = process.env.REDIS_ASYNC_WRITE !== 'false';

// 基础 TTL 配置（秒）
const BASE_TTL_SECONDS = 180; // 基础 3 分钟
const PER_ROUND_TTL_SECONDS = 60; // 每轮额外 1 分钟

// 性能监控
interface PerformanceMetrics {
  totalWrites: number;
  totalReads: number;
  totalWriteTime: number;
  totalReadTime: number;
  totalCompressedSize: number;
  totalUncompressedSize: number;
  errors: number;
}

const metrics: PerformanceMetrics = {
  totalWrites: 0,
  totalReads: 0,
  totalWriteTime: 0,
  totalReadTime: 0,
  totalCompressedSize: 0,
  totalUncompressedSize: 0,
  errors: 0,
};

// Redis 客户端实例
let redisClient: Redis | null = null;

/**
 * 获取 Redis 客户端实例（单例模式）
 */
export function getRedisClient(): Redis {
  throw new Error('❌ Redis已弃用，请使用MongoDB。详见：docs/ARCHITECTURE_DECISION.md');
  
  /* ❌ 已注释：避免自动连接Redis
  if (!redisClient) {
    redisClient = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    redisClient.on('connect', () => {
      console.log(`✅ Redis 已连接: ${REDIS_HOST}:${REDIS_PORT}`);
    });

    redisClient.on('error', (err) => {
      console.error('❌ Redis 连接错误:', err);
    });

    redisClient.on('reconnecting', () => {
      console.log('🔄 Redis 重新连接中...');
    });
  }

  return redisClient;
  */
}

/**
 * 检查 Redis 是否可用
 */
export async function isRedisAvailable(): Promise<boolean> {
  try {
    const client = getRedisClient();
    await client.ping();
    return true;
  } catch (error) {
    console.warn('⚠️  Redis 不可用，将降级到不使用缓存:', error);
    return false;
  }
}

/**
 * 计算动态 TTL（根据会话进度）
 * - 已完成轮次越多，剩余时间越少，TTL 越短
 * - 确保用户有足够时间重连
 */
function calculateDynamicTTL(completedRounds: number, maxRounds: number = 5): number {
  const remainingRounds = Math.max(1, maxRounds - completedRounds);
  return BASE_TTL_SECONDS + remainingRounds * PER_ROUND_TTL_SECONDS;
}

/**
 * 压缩数据（使用 gzip）
 */
async function compressData(data: string): Promise<Buffer> {
  const startTime = Date.now();
  const buffer = Buffer.from(data, 'utf-8');
  const compressed = await gzipAsync(buffer);
  
  // 记录性能指标
  metrics.totalUncompressedSize += buffer.length;
  metrics.totalCompressedSize += compressed.length;
  
  const compressionRatio = ((1 - compressed.length / buffer.length) * 100).toFixed(1);
  const elapsed = Date.now() - startTime;
  
  console.log(`📦 压缩完成: ${buffer.length} → ${compressed.length} bytes (节省 ${compressionRatio}%, 耗时 ${elapsed}ms)`);
  
  return compressed;
}

/**
 * 解压数据（使用 gunzip）
 */
async function decompressData(buffer: Buffer): Promise<string> {
  const startTime = Date.now();
  const decompressed = await gunzipAsync(buffer);
  const elapsed = Date.now() - startTime;
  
  console.log(`📂 解压完成: ${buffer.length} → ${decompressed.length} bytes (耗时 ${elapsed}ms)`);
  
  return decompressed.toString('utf-8');
}

/**
 * 保存多 agent 会话状态
 * 
 * 优化特性：
 * - ✅ gzip 压缩（节省内存）
 * - ✅ 异步写入（可选，避免阻塞）
 * - ✅ 动态 TTL（根据进度调整）
 * - ✅ 性能监控
 */
export async function saveMultiAgentState(
  conversationId: string,
  assistantMessageId: string,
  state: {
    completedRounds: number;
    sessionState: any;
    userQuery: string;
  },
  options?: {
    maxRounds?: number;
    async?: boolean; // 是否异步写入（默认使用全局配置）
  }
): Promise<boolean> {
  const startTime = Date.now();
  
  try {
    const client = getRedisClient();
    const key = `multi_agent:${conversationId}:${assistantMessageId}`;
    
    // 计算动态 TTL
    const ttl = calculateDynamicTTL(state.completedRounds, options?.maxRounds);
    
    // 准备数据
    const dataWithTimestamp = {
      ...state,
      timestamp: Date.now(),
      version: 1, // 版本号，便于未来迁移
    };
    
    const jsonString = JSON.stringify(dataWithTimestamp);
    
    // 根据配置决定是否压缩
    let finalData: string | Buffer;
    let isCompressed = false;
    
    if (ENABLE_COMPRESSION) {
      finalData = await compressData(jsonString);
      isCompressed = true;
    } else {
      finalData = jsonString;
    }
    
    // 保存压缩标志（用于读取时判断）
    const metaKey = `${key}:meta`;
    
    // 决定是否异步写入
    const useAsync = options?.async ?? ENABLE_ASYNC_WRITE;
    
    if (useAsync) {
      // 🚀 异步写入（Fire and Forget）- 不等待完成
      client
        .pipeline()
        .setex(key, ttl, finalData)
        .setex(metaKey, ttl, JSON.stringify({ compressed: isCompressed, rounds: state.completedRounds }))
        .exec()
        .then(() => {
          const elapsed = Date.now() - startTime;
          metrics.totalWrites++;
          metrics.totalWriteTime += elapsed;
          console.log(`💾 [异步] 已保存多 agent 状态: ${key} (第 ${state.completedRounds} 轮, TTL=${ttl}s, 耗时 ${elapsed}ms)`);
        })
        .catch((error) => {
          metrics.errors++;
          console.error('❌ [异步] 保存多 agent 状态失败:', error);
        });
      
      // 立即返回
      return true;
    } else {
      // 🐢 同步写入（等待完成）- 确保数据持久化
      await client
        .pipeline()
        .setex(key, ttl, finalData)
        .setex(metaKey, ttl, JSON.stringify({ compressed: isCompressed, rounds: state.completedRounds }))
        .exec();
      
      const elapsed = Date.now() - startTime;
      metrics.totalWrites++;
      metrics.totalWriteTime += elapsed;
      
      console.log(`💾 [同步] 已保存多 agent 状态: ${key} (第 ${state.completedRounds} 轮, TTL=${ttl}s, 耗时 ${elapsed}ms)`);
      return true;
    }
  } catch (error) {
    metrics.errors++;
    console.error('❌ 保存多 agent 状态失败:', error);
    return false;
  }
}

/**
 * 恢复多 agent 会话状态
 * 
 * 优化特性：
 * - ✅ 自动识别压缩格式并解压
 * - ✅ 滑动 TTL（访问时自动续期）
 * - ✅ 性能监控
 */
export async function loadMultiAgentState(
  conversationId: string,
  assistantMessageId: string,
  options?: {
    renewTTL?: boolean; // 是否续期 TTL（默认 true）
    maxRounds?: number; // 用于计算续期 TTL
  }
): Promise<{
  completedRounds: number;
  sessionState: any;
  userQuery: string;
  timestamp: number;
  version?: number;
} | null> {
  const startTime = Date.now();
  
  try {
    const client = getRedisClient();
    const key = `multi_agent:${conversationId}:${assistantMessageId}`;
    const metaKey = `${key}:meta`;
    
    // 读取元数据
    const metaDataStr = await client.get(metaKey);
    const meta = metaDataStr ? JSON.parse(metaDataStr) : { compressed: false };
    
    // 读取数据
    const data = await client.getBuffer(key);
    if (!data) {
      console.log(`📭 未找到缓存状态: ${key}`);
      return null;
    }
    
    // 根据元数据判断是否需要解压
    let jsonString: string;
    
    if (meta.compressed) {
      jsonString = await decompressData(data);
    } else {
      jsonString = data.toString('utf-8');
    }
    
    const state = JSON.parse(jsonString);
    
    // 滑动 TTL（访问时续期）
    const shouldRenew = options?.renewTTL ?? true;
    if (shouldRenew) {
      const newTTL = calculateDynamicTTL(state.completedRounds, options?.maxRounds);
      await client
        .pipeline()
        .expire(key, newTTL)
        .expire(metaKey, newTTL)
        .exec();
      console.log(`🔄 已续期 TTL: ${key} → ${newTTL}s`);
    }
    
    const elapsed = Date.now() - startTime;
    metrics.totalReads++;
    metrics.totalReadTime += elapsed;
    
    console.log(`📦 已恢复多 agent 状态: ${key} (第 ${state.completedRounds} 轮, 耗时 ${elapsed}ms)`);
    return state;
  } catch (error) {
    metrics.errors++;
    console.error('❌ 恢复多 agent 状态失败:', error);
    return null;
  }
}

/**
 * 删除多 agent 会话状态（完成或取消时）
 */
export async function deleteMultiAgentState(
  conversationId: string,
  assistantMessageId: string
): Promise<boolean> {
  try {
    const client = getRedisClient();
    const key = `multi_agent:${conversationId}:${assistantMessageId}`;
    
    await client.del(key);
    console.log(`🗑️  已删除多 agent 状态: ${key}`);
    return true;
  } catch (error) {
    console.error('❌ 删除多 agent 状态失败:', error);
    return false;
  }
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
  console.log('📊 Redis 性能统计已重置');
}

/**
 * 打印性能报告
 */
export function printRedisMetrics(): void {
  const stats = getRedisMetrics();
  
  console.log('\n📊 ===== Redis 性能报告 =====');
  console.log(`📝 总写入次数: ${stats.totalWrites}`);
  console.log(`📖 总读取次数: ${stats.totalReads}`);
  console.log(`⏱️  平均写入耗时: ${stats.avgWriteTime}ms`);
  console.log(`⏱️  平均读取耗时: ${stats.avgReadTime}ms`);
  console.log(`💾 压缩前总大小: ${(stats.totalUncompressedSize / 1024).toFixed(2)} KB`);
  console.log(`💾 压缩后总大小: ${(stats.totalCompressedSize / 1024).toFixed(2)} KB`);
  console.log(`📦 压缩率: ${stats.compressionRatio}%`);
  console.log(`❌ 错误次数: ${stats.errors}`);
  console.log('============================\n');
}

/**
 * 关闭 Redis 连接（优雅退出时使用）
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    // 打印最终性能报告
    printRedisMetrics();
    
    await redisClient.quit();
    redisClient = null;
    console.log('👋 Redis 连接已关闭');
  }
}

