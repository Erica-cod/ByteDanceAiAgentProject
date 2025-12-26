/**
 * SSE 并发限制器（进程内）+ 队列化支持
 *
 * 说明：
 * - 这是"单机/单进程"级别的限制：适合本地开发、单实例部署、面试演示。
 * - 如果是多实例/Serverless，需要用 Redis / 数据库 / 网关层限流，才能全局生效。
 * 
 * 队列化机制：
 * - 当名额满时，请求会被加入队列并返回 token
 * - 客户端携带 token 重试可保持队列位置
 * - 计算基于队列位置的预估等待时间（含 jitter 防惊群）
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
    const queueInfo = enqueue(userId, queueToken);
    return {
      ok: false,
      reason: '服务端繁忙：当前流式连接过多，已加入队列',
      retryAfterSec: queueInfo.retryAfterSec,
      snapshot: { global: activeGlobal, user: currentUser, maxGlobal, maxPerUser },
      queueToken: queueInfo.token,
      queuePosition: queueInfo.position,
      estimatedWaitSec: queueInfo.estimatedWaitSec,
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


