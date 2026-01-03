/**
 * ============================================================
 * Redis 多 Agent 状态缓存模块
 * ============================================================
 * 
 * 用途：多 Agent 讨论回合状态缓存（防止断网重连）
 * 
 * 为什么使用 Redis：
 * - 这是过程性数据，不需要永久持久化
 * - 用于断网重连场景，需要快速查询（亚毫秒级）
 * - 自动过期清理（TTL），避免内存占用
 * - 支持按用户 ID 查找未完成的讨论
 * 
 * 关键特性：
 * - gzip 压缩存储（节省 60-80% 内存）
 * - 动态 TTL（根据讨论进度调整过期时间）
 * - 支持异步写入（Fire and Forget，不阻塞主流程）
 * - 按用户维度索引（快速查找未完成讨论）
 * 
 * ============================================================
 */

import type { Redis } from 'ioredis';
import { compressData, decompressData, recordWrite, recordRead, recordError } from './redis-utils.js';

// 基础 TTL 配置（秒）
const BASE_TTL_SECONDS = 180; // 基础 3 分钟
const PER_ROUND_TTL_SECONDS = 60; // 每轮额外 1 分钟

// 是否启用压缩（默认开启）
const ENABLE_COMPRESSION = process.env.REDIS_COMPRESSION !== 'false';

// 是否启用异步写入（默认开启，生产环境建议开启以提升性能）
const ENABLE_ASYNC_WRITE = process.env.REDIS_ASYNC_WRITE !== 'false';

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
 * 多 Agent 状态数据结构
 */
export interface MultiAgentState {
  conversationId: string;
  assistantMessageId: string;
  userId: string;               // 用户 ID，用于索引
  completedRounds: number;
  maxRounds?: number;
  sessionState: any;
  userQuery: string;
  timestamp: number;
  version: number;
}

/**
 * 保存多 agent 会话状态
 * 
 * 优化特性：
 * - gzip 压缩（节省内存）
 * - 异步写入（可选，避免阻塞）
 * - 动态 TTL（根据进度调整）
 * - 性能监控
 * - 按用户维度索引（支持查找未完成讨论）
 */
export async function saveMultiAgentState(
  client: Redis,
  conversationId: string,
  assistantMessageId: string,
  userId: string,
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
    const key = `multi_agent:${conversationId}:${assistantMessageId}`;
    const userIndexKey = `multi_agent_user:${userId}`;
    
    // 计算动态 TTL
    const ttl = calculateDynamicTTL(state.completedRounds, options?.maxRounds);
    
    // 准备数据
    const dataWithTimestamp: MultiAgentState = {
      conversationId,
      assistantMessageId,
      userId,
      ...state,
      maxRounds: options?.maxRounds,
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
    
    // 构建索引值（用于按用户查找）
    const indexValue = JSON.stringify({
      conversationId,
      assistantMessageId,
      completedRounds: state.completedRounds,
      maxRounds: options?.maxRounds,
      timestamp: dataWithTimestamp.timestamp,
    });
    
    if (useAsync) {
      // 异步写入（Fire and Forget）- 不等待完成
      client
        .pipeline()
        .setex(key, ttl, finalData)
        .setex(metaKey, ttl, JSON.stringify({ compressed: isCompressed, rounds: state.completedRounds }))
        // 添加到用户索引（使用 Sorted Set，按时间戳排序）
        .zadd(userIndexKey, dataWithTimestamp.timestamp, `${conversationId}:${assistantMessageId}`)
        .expire(userIndexKey, ttl)
        .exec()
        .then(() => {
          const elapsed = Date.now() - startTime;
          recordWrite(elapsed);
          console.log(` [异步] 已保存多 agent 状态: ${key} (userId=${userId}, 第 ${state.completedRounds} 轮, TTL=${ttl}s, 耗时 ${elapsed}ms)`);
        })
        .catch((error) => {
          recordError();
          console.error(' [异步] 保存多 agent 状态失败:', error);
        });
      
      // 立即返回
      return true;
    } else {
      // 同步写入（等待完成）- 确保数据持久化
      await client
        .pipeline()
        .setex(key, ttl, finalData)
        .setex(metaKey, ttl, JSON.stringify({ compressed: isCompressed, rounds: state.completedRounds }))
        // 添加到用户索引（使用 Sorted Set，按时间戳排序）
        .zadd(userIndexKey, dataWithTimestamp.timestamp, `${conversationId}:${assistantMessageId}`)
        .expire(userIndexKey, ttl)
        .exec();
      
      const elapsed = Date.now() - startTime;
      recordWrite(elapsed);
      
      console.log(` [同步] 已保存多 agent 状态: ${key} (userId=${userId}, 第 ${state.completedRounds} 轮, TTL=${ttl}s, 耗时 ${elapsed}ms)`);
      return true;
    }
  } catch (error) {
    recordError();
    console.error(' 保存多 agent 状态失败:', error);
    return false;
  }
}

/**
 * 恢复多 agent 会话状态
 * 
 * 优化特性：
 * - 自动识别压缩格式并解压
 * - 滑动 TTL（访问时自动续期）
 * - 性能监控
 */
export async function loadMultiAgentState(
  client: Redis,
  conversationId: string,
  assistantMessageId: string,
  options?: {
    renewTTL?: boolean; // 是否续期 TTL（默认 true）
    maxRounds?: number; // 用于计算续期 TTL
  }
): Promise<MultiAgentState | null> {
  const startTime = Date.now();
  
  try {
    const key = `multi_agent:${conversationId}:${assistantMessageId}`;
    const metaKey = `${key}:meta`;
    
    // 读取元数据
    const metaDataStr = await client.get(metaKey);
    const meta = metaDataStr ? JSON.parse(metaDataStr) : { compressed: false };
    
    // 读取数据
    const data = await client.getBuffer(key);
    if (!data) {
      console.log(` 未找到缓存状态: ${key}`);
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
      console.log(` 已续期 TTL: ${key} → ${newTTL}s`);
    }
    
    const elapsed = Date.now() - startTime;
    recordRead(elapsed);
    
    console.log(` 已恢复多 agent 状态: ${key} (第 ${state.completedRounds} 轮, 耗时 ${elapsed}ms)`);
    return state;
  } catch (error) {
    recordError();
    console.error(' 恢复多 agent 状态失败:', error);
    return null;
  }
}

/**
 * 删除多 agent 会话状态（完成或取消时）
 * 同时从用户索引中移除
 */
export async function deleteMultiAgentState(
  client: Redis,
  conversationId: string,
  assistantMessageId: string,
  userId?: string
): Promise<boolean> {
  try {
    const key = `multi_agent:${conversationId}:${assistantMessageId}`;
    const metaKey = `${key}:meta`;
    
    // 删除主数据和元数据
    await client.del(key, metaKey);
    
    // 如果提供了 userId，从用户索引中移除
    if (userId) {
      const userIndexKey = `multi_agent_user:${userId}`;
      await client.zrem(userIndexKey, `${conversationId}:${assistantMessageId}`);
      console.log(`  已删除多 agent 状态并更新用户索引: ${key}`);
    } else {
      console.log(`  已删除多 agent 状态: ${key}`);
    }
    
    return true;
  } catch (error) {
    console.error(' 删除多 agent 状态失败:', error);
    return false;
  }
}

/**
 * 查找用户未完成的多 Agent 讨论
 * 
 * 用途：断网重连后，优先按用户 ID 查找未完成的讨论
 * 
 * @param client - Redis 客户端实例
 * @param userId - 用户 ID
 * @returns 未完成的讨论列表（按时间倒序，最新的在前）
 */
export async function findUnfinishedDiscussions(
  client: Redis,
  userId: string
): Promise<Array<{
  conversationId: string;
  assistantMessageId: string;
  completedRounds: number;
  maxRounds?: number;
  timestamp: number;
  state: MultiAgentState | null;
}>> {
  try {
    const userIndexKey = `multi_agent_user:${userId}`;
    
    // 获取用户的所有会话（按时间倒序，最新的在前）
    const sessions = await client.zrevrange(userIndexKey, 0, -1);
    
    if (sessions.length === 0) {
      console.log(` [MultiAgent] 用户 ${userId} 没有未完成的讨论`);
      return [];
    }
    
    console.log(` [MultiAgent] 找到 ${sessions.length} 个会话: userId=${userId}`);
    
    // 批量获取状态数据
    const results: Array<{
      conversationId: string;
      assistantMessageId: string;
      completedRounds: number;
      maxRounds?: number;
      timestamp: number;
      state: MultiAgentState | null;
    }> = [];
    
    for (const session of sessions) {
      const [conversationId, assistantMessageId] = session.split(':');
      
      // 获取完整状态
      const state = await loadMultiAgentState(client, conversationId, assistantMessageId, {
        renewTTL: false, // 不续期，仅查询
      });
      
      if (state) {
        // 检查是否未完成（completedRounds < maxRounds）
        const maxRounds = state.maxRounds || 5;
        if (state.completedRounds < maxRounds) {
          results.push({
            conversationId,
            assistantMessageId,
            completedRounds: state.completedRounds,
            maxRounds: state.maxRounds,
            timestamp: state.timestamp,
            state,
          });
        }
      }
    }
    
    console.log(` [MultiAgent] 找到 ${results.length} 个未完成的讨论`);
    return results;
  } catch (error) {
    console.error(' [MultiAgent] 查找未完成讨论失败:', error);
    return [];
  }
}

/**
 * 清理用户的所有多 Agent 状态（用于测试或清理）
 * 
 * @param client - Redis 客户端实例
 * @param userId - 用户 ID
 * @returns 是否清理成功
 */
export async function clearUserMultiAgentStates(
  client: Redis,
  userId: string
): Promise<boolean> {
  try {
    const userIndexKey = `multi_agent_user:${userId}`;
    
    // 获取所有会话
    const sessions = await client.zrange(userIndexKey, 0, -1);
    
    if (sessions.length === 0) {
      console.log(` [MultiAgent] 用户 ${userId} 没有会话记录`);
      return true;
    }
    
    // 删除所有状态数据
    for (const session of sessions) {
      const [conversationId, assistantMessageId] = session.split(':');
      const key = `multi_agent:${conversationId}:${assistantMessageId}`;
      const metaKey = `${key}:meta`;
      await client.del(key, metaKey);
    }
    
    // 删除用户索引
    await client.del(userIndexKey);
    
    console.log(` [MultiAgent] 已清除用户 ${userId} 的 ${sessions.length} 个会话`);
    return true;
  } catch (error) {
    console.error(' [MultiAgent] 清除用户状态失败:', error);
    return false;
  }
}

