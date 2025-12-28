/**
 * SSE 并发限制器（内存实现）+ 队列化支持
 *
 * 核心思想：保护单台服务器的本地资源（CPU/内存/网络连接数）
 * 
 * 设计说明：
 * - 使用内存变量，适合单实例部署或多地区独立部署 ✅
 * - 性能：< 0.1ms 延迟，远快于 Redis (1-2ms)
 * - 可靠性：零依赖，无单点故障
 * 
 * 队列化机制：
 * - 当名额满时，请求加入队列并返回 token（而不是直接拒绝）
 * - 客户端携带 token 重试可保持队列位置
 * - 计算预估等待时间（含 jitter 防惊群）
 * 
 * 部署场景：
 * 1. 单实例部署：✅ 内存最优（零依赖、最快）
 * 2. 全球化部署：✅ 各地区独立限流（美国/中国各保护自己的本地资源）
 * 3. 单地区10+台负载均衡：⚠️ 此时才需要考虑 Redis（但大部分项目不会到这个规模）
 * 
 * 为什么不默认用 Redis：
 * - SSE限流保护的是本地资源，不是全局业务限制
 * - 类比：每家餐厅分店限流200人，不需要全球统一计数
 * - 内存方案更快、更可靠、零运维成本
 * 
 * 详见：docs/ARCHITECTURE_DECISION.md
 */

import { enqueue, dequeue } from './queueManager.js';

type AcquireResult =
  | {
      ok: true;
      /** 释放名额（幂等） */
      release: () => void;
      snapshot: { global: number; user: number; maxGlobal: number; maxPerUser: number };
      /** 如果客户端带了 token 且成功获得名额，返回该 token */
      token?: string;
    }
  | {
      ok: false;
      /** 给客户端的提示信息 */
      reason: string;
      /** 建议客户端多少秒后再重试（用于 Retry-After） */
      retryAfterSec: number;
      snapshot: { global: number; user: number; maxGlobal: number; maxPerUser: number };
      /** 队列 token（客户端下次重试需携带） */
      queueToken: string;
      /** 队列位置（从 0 开始） */
      queuePosition: number;
      /** 预估等待时间（秒） */
      estimatedWaitSec: number;
    };

let activeGlobal = 0;
const activeByUser = new Map<string, number>();

function toInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getLimits() {
  return {
    maxGlobal: toInt(process.env.MAX_SSE_CONNECTIONS, 200),
    maxPerUser: toInt(process.env.MAX_SSE_CONNECTIONS_PER_USER, 1),
  };
}

/**
 * 尝试占用一个 SSE 名额（支持队列化）
 * 
 * @param userId 用户 ID
 * @param queueToken 客户端携带的队列 token（可选，用于保持队列位置）
 */
export function acquireSSESlot(userId: string, queueToken?: string): AcquireResult {
  const { maxGlobal, maxPerUser } = getLimits();
  const currentUser = activeByUser.get(userId) ?? 0;

  // 单用户上限（优先检查，避免单用户霸占队列）
  if (currentUser >= maxPerUser) {
    // 单用户限制不走队列，直接拒绝（让用户停止当前对话）
    return {
      ok: false,
      reason: '你已有正在生成中的对话，请先停止上一条或等待结束',
      retryAfterSec: 1,
      snapshot: { global: activeGlobal, user: currentUser, maxGlobal, maxPerUser },
      queueToken: queueToken || `single_user_limit_${Date.now()}`,
      queuePosition: 0,
      estimatedWaitSec: 1,
    };
  }

  // 全局上限：加入队列
  if (activeGlobal >= maxGlobal) {
    const queueResult = enqueue(userId, queueToken);
    
    // 检查是否被限频拒绝
    if (queueResult.rejected) {
      return {
        ok: false,
        reason: queueResult.reason,
        retryAfterSec: queueResult.cooldownSec,
        snapshot: { global: activeGlobal, user: currentUser, maxGlobal, maxPerUser },
        queueToken: queueToken || `rejected_${Date.now()}`,
        queuePosition: -1,
        estimatedWaitSec: queueResult.cooldownSec,
      };
    }
    
    // TypeScript 类型收窄：此时 queueResult 一定是 rejected: false 的类型
    // 使用类型断言明确告诉 TypeScript
    const successResult = queueResult as { rejected: false; token: string; position: number; retryAfterSec: number; estimatedWaitSec: number };
    return {
      ok: false,
      reason: '服务端繁忙：当前流式连接过多，已加入队列',
      retryAfterSec: successResult.retryAfterSec,
      snapshot: { global: activeGlobal, user: currentUser, maxGlobal, maxPerUser },
      queueToken: successResult.token,
      queuePosition: successResult.position,
      estimatedWaitSec: successResult.estimatedWaitSec,
    };
  }

  // 有空位，占用名额
  activeGlobal += 1;
  activeByUser.set(userId, currentUser + 1);

  // 如果客户端带了 token，从队列中移除（已成功获得名额）
  if (queueToken) {
    dequeue(queueToken);
  }

  // 幂等释放
  let released = false;
  const release = () => {
    if (released) return;
    released = true;

    activeGlobal = Math.max(0, activeGlobal - 1);
    const prev = activeByUser.get(userId) ?? 0;
    const next = Math.max(0, prev - 1);
    if (next === 0) activeByUser.delete(userId);
    else activeByUser.set(userId, next);
  };

  return {
    ok: true,
    release,
    snapshot: {
      global: activeGlobal,
      user: currentUser + 1,
      maxGlobal,
      maxPerUser,
    },
    token: queueToken, // 返回 token 用于日志追踪
  };
}


