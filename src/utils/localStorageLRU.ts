/**
 * LocalStorage LRU 管理
 * 
 * 职责：
 * 1. 追踪对话的本地访问时间
 * 2. 自动清理最少使用的对话缓存
 * 3. 监控 LocalStorage 使用率
 * 4. 优雅降级（存储满时的处理）
 */

interface ConversationAccessRecord {
  conversationId: string;
  lastAccessedAt: number; // 时间戳
  messageCount: number;   // 消息数（用于估算占用空间）
}

interface LRUMetadata {
  version: number;
  conversations: ConversationAccessRecord[];
  lastCleanupAt: number;
}

const LRU_METADATA_KEY = 'chat_lru_metadata_v1';
const MAX_CACHED_CONVERSATIONS = 20; // 最多缓存 20 个对话
const CACHE_EXPIRE_DAYS = 7;         // 7 天未访问自动清理
const STORAGE_USAGE_THRESHOLD = 0.8; // 使用率超过 80% 触发清理

/**
 * 获取 LRU 元数据
 */
function getLRUMetadata(): LRUMetadata {
  try {
    const data = localStorage.getItem(LRU_METADATA_KEY);
    if (data) {
      const parsed = JSON.parse(data) as LRUMetadata;
      if (parsed.version === 1 && Array.isArray(parsed.conversations)) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn('⚠️ 读取 LRU 元数据失败:', error);
  }

  // 返回默认值
  return {
    version: 1,
    conversations: [],
    lastCleanupAt: Date.now(),
  };
}

/**
 * 保存 LRU 元数据
 */
function saveLRUMetadata(metadata: LRUMetadata): void {
  try {
    localStorage.setItem(LRU_METADATA_KEY, JSON.stringify(metadata));
  } catch (error) {
    console.error('❌ 保存 LRU 元数据失败:', error);
  }
}

/**
 * 记录对话访问（更新访问时间）
 */
export function touchConversationCache(conversationId: string, messageCount: number = 0): void {
  try {
    const metadata = getLRUMetadata();
    const now = Date.now();

    // 查找或创建记录
    const index = metadata.conversations.findIndex((c) => c.conversationId === conversationId);
    if (index >= 0) {
      metadata.conversations[index].lastAccessedAt = now;
      metadata.conversations[index].messageCount = messageCount;
    } else {
      metadata.conversations.push({
        conversationId,
        lastAccessedAt: now,
        messageCount,
      });
    }

    saveLRUMetadata(metadata);
  } catch (error) {
    console.error('❌ 记录对话访问失败:', error);
  }
}

/**
 * 获取 LocalStorage 使用率（估算）
 */
function getStorageUsage(): number {
  try {
    // 估算已使用的空间（遍历所有 key）
    let totalSize = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key) || '';
        totalSize += key.length + value.length;
      }
    }

    // LocalStorage 限额一般是 5MB ~ 10MB，这里按 5MB 计算
    const ESTIMATED_LIMIT = 5 * 1024 * 1024; // 5MB in bytes
    return totalSize / ESTIMATED_LIMIT;
  } catch {
    return 0;
  }
}

/**
 * 清理过期的对话缓存
 * 
 * @param force - 是否强制清理（忽略时间限制）
 * @param userId - 用户 ID（用于通知服务器归档）
 * @returns 清理的对话数量
 */
export async function cleanupExpiredConversationCache(
  force: boolean = false,
  userId?: string
): Promise<number> {
  try {
    const metadata = getLRUMetadata();
    const now = Date.now();

    // 计算过期时间戳
    const expireThreshold = now - CACHE_EXPIRE_DAYS * 24 * 60 * 60 * 1000;

    // 找出过期的对话
    const expiredConversations = metadata.conversations.filter(
      (c) => force || c.lastAccessedAt < expireThreshold
    );

    if (expiredConversations.length === 0) {
      return 0;
    }

    // ✅ 通知服务器归档这些对话
    if (userId) {
      await notifyServerToArchive(expiredConversations.map(c => c.conversationId), userId);
    }

    // 删除本地缓存
    expiredConversations.forEach((c) => {
      // 删除新版本缓存
      localStorage.removeItem(`chat_cache_v1:${c.conversationId}`);
      // 删除旧版本缓存（兼容）
      localStorage.removeItem(`chat_${c.conversationId}`);
      // 删除加密缓存（如果有）
      localStorage.removeItem(`chat_cache_v2:${c.conversationId}`);
    });

    // 更新元数据
    metadata.conversations = metadata.conversations.filter(
      (c) => !expiredConversations.some((e) => e.conversationId === c.conversationId)
    );
    metadata.lastCleanupAt = now;
    saveLRUMetadata(metadata);

    console.log(`✅ 清理了 ${expiredConversations.length} 个过期对话缓存`);
    return expiredConversations.length;
  } catch (error) {
    console.error('❌ 清理过期缓存失败:', error);
    return 0;
  }
}

/**
 * 清理超出配额的对话缓存（保留最近访问的 N 个）
 * 
 * @param userId - 用户 ID（用于通知服务器归档）
 * @returns 清理的对话数量
 */
export async function cleanupExcessConversationCache(userId?: string): Promise<number> {
  try {
    const metadata = getLRUMetadata();

    if (metadata.conversations.length <= MAX_CACHED_CONVERSATIONS) {
      return 0; // 未超限
    }

    // 按访问时间排序（最近访问的排前面）
    metadata.conversations.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);

    // 保留前 N 个，删除其余的
    const toDelete = metadata.conversations.slice(MAX_CACHED_CONVERSATIONS);

    // ✅ 通知服务器归档这些对话
    if (userId) {
      await notifyServerToArchive(toDelete.map(c => c.conversationId), userId);
    }

    // 删除本地缓存
    toDelete.forEach((c) => {
      localStorage.removeItem(`chat_cache_v1:${c.conversationId}`);
      localStorage.removeItem(`chat_${c.conversationId}`);
      localStorage.removeItem(`chat_cache_v2:${c.conversationId}`);
    });

    // 更新元数据
    metadata.conversations = metadata.conversations.slice(0, MAX_CACHED_CONVERSATIONS);
    metadata.lastCleanupAt = Date.now();
    saveLRUMetadata(metadata);

    console.log(`✅ 清理了 ${toDelete.length} 个超出配额的对话缓存`);
    return toDelete.length;
  } catch (error) {
    console.error('❌ 清理超限缓存失败:', error);
    return 0;
  }
}

/**
 * 通知服务器归档对话
 * 
 * @param conversationIds - 要归档的对话 ID 列表
 * @param userId - 用户 ID
 */
async function notifyServerToArchive(conversationIds: string[], userId: string): Promise<void> {
  if (conversationIds.length === 0) return;

  try {
    // 批量归档请求
    const promises = conversationIds.map((conversationId) =>
      fetch('/api/conversations/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, userId }),
      }).catch((err) => {
        console.warn(`⚠️ 归档对话 ${conversationId} 失败:`, err);
      })
    );

    await Promise.all(promises);
    console.log(`✅ 已通知服务器归档 ${conversationIds.length} 个对话`);
  } catch (error) {
    console.error('❌ 批量归档通知失败:', error);
  }
}

/**
 * 智能清理：根据使用率和配额自动决策
 * 
 * @param userId - 用户 ID（用于通知服务器归档）
 * @returns 清理的对话数量
 */
export async function smartCleanupConversationCache(userId?: string): Promise<number> {
  try {
    const storageUsage = getStorageUsage();
    const forceCleanup = storageUsage > STORAGE_USAGE_THRESHOLD;

    console.log(`📊 LocalStorage 使用率: ${(storageUsage * 100).toFixed(1)}%`);

    let totalCleaned = 0;

    // 1. 清理过期的缓存
    const expiredCleaned = await cleanupExpiredConversationCache(forceCleanup, userId);
    totalCleaned += expiredCleaned;

    // 2. 如果使用率仍然过高，或者超出配额，清理超限的缓存
    if (forceCleanup || expiredCleaned === 0) {
      const excessCleaned = await cleanupExcessConversationCache(userId);
      totalCleaned += excessCleaned;
    }

    if (totalCleaned > 0) {
      console.log(`✅ 智能清理完成，共清理 ${totalCleaned} 个对话缓存`);
    }

    return totalCleaned;
  } catch (error) {
    console.error('❌ 智能清理失败:', error);
    return 0;
  }
}

/**
 * 删除指定对话的缓存（同时通知服务器归档）
 * 
 * @param conversationId - 对话 ID
 * @param userId - 用户 ID（可选，用于通知服务器）
 */
export async function removeConversationCache(
  conversationId: string,
  userId?: string
): Promise<void> {
  try {
    // ✅ 通知服务器归档
    if (userId) {
      await notifyServerToArchive([conversationId], userId);
    }

    // 删除所有版本的缓存
    localStorage.removeItem(`chat_cache_v1:${conversationId}`);
    localStorage.removeItem(`chat_${conversationId}`);
    localStorage.removeItem(`chat_cache_v2:${conversationId}`);

    // 更新元数据
    const metadata = getLRUMetadata();
    metadata.conversations = metadata.conversations.filter(
      (c) => c.conversationId !== conversationId
    );
    saveLRUMetadata(metadata);

    console.log(`✅ 删除对话缓存并通知服务器归档: ${conversationId}`);
  } catch (error) {
    console.error('❌ 删除对话缓存失败:', error);
  }
}

/**
 * 获取缓存的对话列表（按访问时间排序）
 */
export function getCachedConversations(): ConversationAccessRecord[] {
  const metadata = getLRUMetadata();
  return metadata.conversations.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
}

/**
 * 初始化：页面加载时执行一次智能清理
 * 
 * @param userId - 用户 ID（用于通知服务器归档）
 */
export async function initLocalStorageLRU(userId?: string): Promise<void> {
  try {
    // 检查是否需要清理（避免频繁清理）
    const metadata = getLRUMetadata();
    const now = Date.now();
    const timeSinceLastCleanup = now - metadata.lastCleanupAt;

    // 每天最多清理一次（除非使用率过高）
    const shouldCleanup =
      timeSinceLastCleanup > 24 * 60 * 60 * 1000 ||
      getStorageUsage() > STORAGE_USAGE_THRESHOLD;

    if (shouldCleanup) {
      console.log('🧹 执行 LocalStorage LRU 初始化清理...');
      await smartCleanupConversationCache(userId);
    }
  } catch (error) {
    console.error('❌ 初始化 LocalStorage LRU 失败:', error);
  }
}

