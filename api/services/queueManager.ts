/**
 * SSE 队列管理器（MVP 内存版本）
 * 
 * 功能：
 * - 当并发名额满时，将请求加入队列而非直接拒绝
 * - 给每个排队请求分配 token，客户端可携带 token 重试保持队列位置
 * - 计算预估等待时间（基于队列位置和放行速率）
 * - 自动清理过期 token
 * 
 * 限制（MVP）：
 * - 单进程内存存储，重启会丢失队列
 * - 多实例部署时无法共享队列
 * - 生产环境建议迁移到 Redis ZSET + Lua 原子操作
 */

interface QueueItem {
  token: string;
  userId: string;
  createdAt: number; // timestamp
  expireAt: number;  // timestamp
}

// 队列存储（按入队顺序）
const queue: QueueItem[] = [];

// token -> QueueItem 快速查找
const tokenMap = new Map<string, QueueItem>();

// 配置：放行速率（每秒允许多少新连接进入 SSE）
const RELEASE_RATE = 5; // 每秒放行 5 个

// 配置：token 过期时间（毫秒）
const TOKEN_EXPIRE_MS = 3 * 60 * 1000; // 3 分钟

// 配置：jitter 范围（毫秒）
const JITTER_MIN_MS = 300;
const JITTER_MAX_MS = 1000;

/**
 * 生成唯一的队列 token
 */
function generateToken(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `q_${timestamp}_${random}`;
}

/**
 * 添加随机 jitter 防止同秒重试
 */
function addJitter(baseMs: number): number {
  const jitter = Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS + 1)) + JITTER_MIN_MS;
  return baseMs + jitter;
}

/**
 * 清理过期的 token（按需清理，避免定时器）
 */
function cleanExpiredTokens(): void {
  const now = Date.now();
  let removed = 0;

  // 从队列头开始清理过期项
  while (queue.length > 0 && queue[0].expireAt < now) {
    const item = queue.shift()!;
    tokenMap.delete(item.token);
    removed++;
  }

  if (removed > 0) {
    console.log(`🧹 [QueueManager] 清理了 ${removed} 个过期 token`);
  }
}

/**
 * 加入队列（或更新已有 token 的位置）
 * 
 * @param userId 用户 ID
 * @param existingToken 客户端携带的已有 token（可选）
 * @returns token + position + retryAfter
 */
export function enqueue(
  userId: string,
  existingToken?: string
): { token: string; position: number; retryAfterSec: number; estimatedWaitSec: number } {
  // 先清理过期 token
  cleanExpiredTokens();

  // 如果客户端带了 token 且 token 仍在队列中，返回它的位置
  if (existingToken && tokenMap.has(existingToken)) {
    const item = tokenMap.get(existingToken)!;
    const position = queue.findIndex((q) => q.token === existingToken);

    if (position !== -1) {
      // 延长过期时间（用户还在重试，说明还需要这个位置）
      item.expireAt = Date.now() + TOKEN_EXPIRE_MS;

      const estimatedWaitSec = Math.ceil(position / RELEASE_RATE);
      const retryAfterMs = addJitter(estimatedWaitSec * 1000);
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);

      console.log(
        `🔄 [QueueManager] 用户 ${userId} 使用已有 token ${existingToken}，队列位置 ${position}，建议 ${retryAfterSec}s 后重试`
      );

      return { token: existingToken, position, retryAfterSec, estimatedWaitSec };
    }
  }

  // 创建新 token 并加入队列
  const token = generateToken();
  const now = Date.now();
  const item: QueueItem = {
    token,
    userId,
    createdAt: now,
    expireAt: now + TOKEN_EXPIRE_MS,
  };

  queue.push(item);
  tokenMap.set(token, item);

  const position = queue.length - 1;
  const estimatedWaitSec = Math.ceil(position / RELEASE_RATE);
  const retryAfterMs = addJitter(estimatedWaitSec * 1000);
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);

  console.log(
    `➕ [QueueManager] 用户 ${userId} 加入队列，token: ${token}，位置: ${position}，建议 ${retryAfterSec}s 后重试`
  );

  return { token, position, retryAfterSec, estimatedWaitSec };
}

/**
 * 从队列中移除 token（成功获得名额或用户取消）
 */
export function dequeue(token: string): boolean {
  if (!tokenMap.has(token)) {
    return false;
  }

  const index = queue.findIndex((q) => q.token === token);
  if (index !== -1) {
    queue.splice(index, 1);
  }
  tokenMap.delete(token);

  console.log(`✅ [QueueManager] Token ${token} 已从队列移除`);
  return true;
}

/**
 * 检查 token 是否仍在队列中
 */
export function hasToken(token: string): boolean {
  cleanExpiredTokens();
  return tokenMap.has(token);
}

/**
 * 获取队列统计信息（用于调试）
 */
export function getQueueStats() {
  cleanExpiredTokens();
  return {
    length: queue.length,
    tokens: queue.map((q) => ({
      token: q.token,
      userId: q.userId,
      waitingMs: Date.now() - q.createdAt,
    })),
  };
}

