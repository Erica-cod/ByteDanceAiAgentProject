/**
 * SSE 并发限制器（进程内）
 *
 * 说明：
 * - 这是“单机/单进程”级别的限制：适合本地开发、单实例部署、面试演示。
 * - 如果是多实例/Serverless，需要用 Redis / 数据库 / 网关层限流，才能全局生效。
 */

type AcquireResult =
  | {
      ok: true;
      /** 释放名额（幂等） */
      release: () => void;
      snapshot: { global: number; user: number; maxGlobal: number; maxPerUser: number };
    }
  | {
      ok: false;
      /** 给客户端的提示信息 */
      reason: string;
      /** 建议客户端多少秒后再重试（用于 Retry-After） */
      retryAfterSec: number;
      snapshot: { global: number; user: number; maxGlobal: number; maxPerUser: number };
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
 * 尝试占用一个 SSE 名额
 */
export function acquireSSESlot(userId: string): AcquireResult {
  const { maxGlobal, maxPerUser } = getLimits();
  const currentUser = activeByUser.get(userId) ?? 0;

  // 全局上限
  if (activeGlobal >= maxGlobal) {
    return {
      ok: false,
      reason: '服务端繁忙：当前流式连接过多，请稍后重试',
      retryAfterSec: 2,
      snapshot: { global: activeGlobal, user: currentUser, maxGlobal, maxPerUser },
    };
  }

  // 单用户上限
  if (currentUser >= maxPerUser) {
    return {
      ok: false,
      reason: '你已有正在生成中的对话，请先停止上一条或等待结束',
      retryAfterSec: 1,
      snapshot: { global: activeGlobal, user: currentUser, maxGlobal, maxPerUser },
    };
  }

  // 占用
  activeGlobal += 1;
  activeByUser.set(userId, currentUser + 1);

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
  };
}


