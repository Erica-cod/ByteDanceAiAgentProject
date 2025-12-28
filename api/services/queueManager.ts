/**
 * SSE 队列管理器（内存版本）
 * 
 * 功能：
 * - 当并发名额满时，将请求加入队列而非直接拒绝
 * - 给每个排队请求分配 token，客户端可携带 token 重试保持队列位置
 * - 计算预估等待时间（基于队列位置和放行速率）
 * - 自动清理过期 token
 * 
 * 设计说明：
 * - 使用内存存储，适合单实例或多地区独立部署 ✅
 * - 每台服务器独立队列，保护本地资源（这是**正确的设计**）
 * - 重启会丢失队列（可接受：用户重新请求即可，队列是临时状态）
 * - SSE限流保护的是单台服务器资源，不是全局业务限制
 * 
 * 何时需要迁移到 Redis：
 * - 单地区部署 10+ 台服务器做负载均衡
 * - 需要跨服务器的精确并发控制
 * - 需要跨服务器的公平排队逻辑
 * 
 * 对于大多数场景（包括全球化部署），内存方案已经足够：
 * - 单实例部署：内存是最优解
 * - 全球化部署：美国/中国各自独立队列，保护各自的本地资源
 * 
 * 详见：docs/ARCHITECTURE_DECISION.md
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

// 无效 token 追踪（防恶意刷队列）
interface InvalidTokenRecord {
  count: number;           // 无效 token 次数
  firstAttemptAt: number;  // 第一次无效尝试时间
  lastAttemptAt: number;   // 最后一次无效尝试时间
}
const invalidTokenAttempts = new Map<string, InvalidTokenRecord>();

// 配置：放行速率（每秒允许多少新连接进入 SSE）
const RELEASE_RATE = 5; // 每秒放行 5 个

// 配置：token 过期时间（毫秒）
const TOKEN_EXPIRE_MS = 3 * 60 * 1000; // 3 分钟

// 配置：jitter 范围（毫秒）
const JITTER_MIN_MS = 300;
const JITTER_MAX_MS = 1000;

// 配置：无效 token 惩罚阈值
const INVALID_TOKEN_WINDOW_MS = 10 * 1000; // 10 秒窗口
const INVALID_TOKEN_MAX_COUNT = 3;          // 10 秒内最多 3 次无效 token
const INVALID_TOKEN_COOLDOWN_MS = 30 * 1000; // 触发后冷却 30 秒

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

  // 清理过期的无效 token 记录（超过冷却期 + 窗口期的）
  for (const [userId, record] of invalidTokenAttempts.entries()) {
    if (now - record.lastAttemptAt > INVALID_TOKEN_COOLDOWN_MS + INVALID_TOKEN_WINDOW_MS) {
      invalidTokenAttempts.delete(userId);
    }
  }
}

/**
 * 加入队列（或更新已有 token 的位置）
 * 
 * @param userId 用户 ID
 * @param existingToken 客户端携带的已有 token（可选）
 * @returns token + position + retryAfter，或者 rejected: true 表示被限频拒绝
 */
export function enqueue(
  userId: string,
  existingToken?: string
): 
  | { rejected: false; token: string; position: number; retryAfterSec: number; estimatedWaitSec: number }
  | { rejected: true; reason: string; cooldownSec: number } {
  
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

      return { rejected: false, token: existingToken, position, retryAfterSec, estimatedWaitSec };
    }
  }

  // 🛡️ 检测无效 token 滥用（防恶意刷队列）
  if (existingToken) {
    const now = Date.now();
    const record = invalidTokenAttempts.get(userId);

    if (record) {
      // 如果在冷却期内，直接拒绝
      if (now - record.lastAttemptAt < INVALID_TOKEN_COOLDOWN_MS) {
        const remainingSec = Math.ceil((INVALID_TOKEN_COOLDOWN_MS - (now - record.lastAttemptAt)) / 1000);
        console.warn(
          `🚫 [QueueManager] 用户 ${userId} 在冷却期内，拒绝入队（剩余 ${remainingSec}s）`
        );
        return {
          rejected: true,
          reason: '检测到异常请求模式，请稍后重试',
          cooldownSec: remainingSec,
        };
      }

      // 检查窗口内的无效 token 次数
      if (now - record.firstAttemptAt < INVALID_TOKEN_WINDOW_MS) {
        // 还在窗口内，增加计数
        record.count += 1;
        record.lastAttemptAt = now;

        if (record.count >= INVALID_TOKEN_MAX_COUNT) {
          console.warn(
            `🚫 [QueueManager] 用户 ${userId} 在 ${INVALID_TOKEN_WINDOW_MS / 1000}s 内发送了 ${record.count} 次无效 token，触发冷却`
          );
          return {
            rejected: true,
            reason: '检测到频繁的无效请求，已触发保护机制',
            cooldownSec: Math.ceil(INVALID_TOKEN_COOLDOWN_MS / 1000),
          };
        }
      } else {
        // 窗口已过，重置计数
        record.count = 1;
        record.firstAttemptAt = now;
        record.lastAttemptAt = now;
      }
    } else {
      // 首次记录无效 token
      invalidTokenAttempts.set(userId, {
        count: 1,
        firstAttemptAt: now,
        lastAttemptAt: now,
      });
    }

    console.log(
      `⚠️  [QueueManager] 用户 ${userId} 提供的 token ${existingToken?.slice(0, 20)}... 无效（第 ${invalidTokenAttempts.get(userId)?.count || 1} 次）`
    );
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

  return { rejected: false, token, position, retryAfterSec, estimatedWaitSec };
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

  console.log(` [QueueManager] Token ${token} 已从队列移除`);
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

