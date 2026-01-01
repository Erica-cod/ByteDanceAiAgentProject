/**
 * 安全对话缓存（加密版本）
 * 
 * 改进：
 * 1. 所有对话数据加密存储
 * 2. 设备绑定（只能在本设备解密）
 * 3. 防止隐私泄露
 * 
 * 使用方式：
 * - 替换原有的 conversationCache.ts
 * - API 完全兼容，无需修改调用代码
 */

import { encryptData, decryptData, isCryptoSupported } from './deviceCrypto.js';

// ===================== 类型定义 =====================

export type CachedRole = 'user' | 'assistant';

export interface CachedMessage {
  id: string;
  clientMessageId?: string;
  role: CachedRole;
  content: string;
  thinking?: string;
  sources?: Array<{ title: string; url: string }>;
  timestamp: number;
  pendingSync?: boolean;
}

interface CacheEnvelopeV2 {
  version: 2;  // 新版本号（支持加密）
  conversationId: string;
  updatedAt: number;
  messages: CachedMessage[];
  encrypted: boolean;  // 标记是否加密
}

// 兼容旧版本
interface CacheEnvelopeV1 {
  version: 1;
  conversationId: string;
  updatedAt: number;
  messages: CachedMessage[];
}

const CACHE_PREFIX = 'chat_cache_v2:';  // 新前缀（区分加密版本）
const LEGACY_PREFIX_V1 = 'chat_cache_v1:';
const LEGACY_PREFIX_OLD = 'chat_';

const MAX_MESSAGES_TO_KEEP = 500;
const MAX_UNSYNCED_TO_KEEP = 50;

// 全局开关：是否启用加密（默认开启）
let ENCRYPTION_ENABLED = true;

/**
 * 设置加密开关
 * @param enabled - 是否启用加密
 */
export function setEncryptionEnabled(enabled: boolean) {
  ENCRYPTION_ENABLED = enabled;
  console.log(`🔐 对话加密: ${enabled ? '已启用' : '已禁用'}`);
}

function cacheKey(conversationId: string) {
  return `${CACHE_PREFIX}${conversationId}`;
}

function safeParseJson<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ===================== 读取缓存 =====================

/**
 * 读取对话缓存（自动解密）
 * 
 * @param conversationId - 对话 ID
 * @returns 消息列表
 */
export async function readConversationCache(conversationId: string): Promise<CachedMessage[]> {
  try {
    // 1️⃣ 尝试读取 V2（加密版本）
    const v2Raw = localStorage.getItem(cacheKey(conversationId));
    if (v2Raw) {
      const v2 = safeParseJson<CacheEnvelopeV2 | any>(v2Raw);
      
      if (v2?.version === 2) {
        // 如果标记为加密，尝试解密
        if (v2.encrypted) {
          try {
            const decrypted = await decryptData<CacheEnvelopeV2>(v2);
            if (Array.isArray(decrypted.messages)) {
              return decrypted.messages;
            }
          } catch (error) {
            console.warn('⚠️ 解密失败（可能在不同设备），清除缓存', error);
            // 解密失败：可能在不同设备或环境变化，清除缓存
            localStorage.removeItem(cacheKey(conversationId));
            return [];
          }
        } else {
          // 未加密的 V2 数据（向后兼容）
          if (Array.isArray(v2.messages)) {
            return v2.messages;
          }
        }
      }
    }
    
    // 2️⃣ 尝试读取 V1（明文版本，向后兼容）
    const v1 = safeParseJson<CacheEnvelopeV1>(
      localStorage.getItem(`${LEGACY_PREFIX_V1}${conversationId}`)
    );
    if (v1?.version === 1 && Array.isArray(v1.messages)) {
      console.log('📦 读取到 V1 缓存，将在下次写入时升级到 V2');
      return v1.messages;
    }
    
    // 3️⃣ 尝试读取旧版本（最早的格式）
    const legacy = safeParseJson<any[]>(
      localStorage.getItem(`${LEGACY_PREFIX_OLD}${conversationId}`)
    );
    if (Array.isArray(legacy)) {
      console.log('📦 读取到旧版本缓存，将在下次写入时升级到 V2');
      return legacy
        .map((m) => ({
          id: String(m.id ?? ''),
          clientMessageId: m.clientMessageId,
          role: m.role as CachedRole,
          content: String(m.content ?? ''),
          thinking: m.thinking,
          sources: m.sources,
          timestamp: typeof m.timestamp === 'number' ? m.timestamp : Date.now(),
          pendingSync: m.pendingSync,
        }))
        .filter((m) => m.id && (m.role === 'user' || m.role === 'assistant'));
    }
    
    return [];
  } catch (error) {
    console.error('❌ 读取缓存失败:', error);
    return [];
  }
}

// ===================== 写入缓存 =====================

/**
 * 写入对话缓存（自动加密）
 * 
 * @param conversationId - 对话 ID
 * @param messages - 消息列表
 */
export async function writeConversationCache(
  conversationId: string,
  messages: CachedMessage[]
): Promise<void> {
  try {
    const trimmed = trimMessages(messages);
    
    // 检查是否支持加密
    const shouldEncrypt = ENCRYPTION_ENABLED && isCryptoSupported();
    
    if (!shouldEncrypt) {
      // 降级：明文存储（向后兼容）
      const env: CacheEnvelopeV2 = {
        version: 2,
        conversationId,
        updatedAt: Date.now(),
        messages: trimmed,
        encrypted: false,
      };
      
      localStorage.setItem(cacheKey(conversationId), JSON.stringify(env));
      return;
    }
    
    // 加密存储
    const envelope: CacheEnvelopeV2 = {
      version: 2,
      conversationId,
      updatedAt: Date.now(),
      messages: trimmed,
      encrypted: true,
    };
    
    // 加密整个 envelope
    const encrypted = await encryptData(envelope);
    
    // 存储加密后的数据（包装一层元数据）
    // 注意：先展开 encrypted（包含 iv, data, version: 1），再覆盖 version 和 encrypted 标记
    const wrapper = {
      ...encrypted,      // iv, data, version: 1
      version: 2,        // 覆盖为 V2（表示缓存格式版本）
      encrypted: true,   // 标记为已加密
    };
    
    localStorage.setItem(cacheKey(conversationId), JSON.stringify(wrapper));
    
    console.log(`🔐 已加密存储 ${trimmed.length} 条消息 (${conversationId.slice(0, 8)}...)`);
  } catch (error) {
    console.error('❌ 写入缓存失败:', error);
    
    // 降级：尝试明文存储（确保功能可用）
    try {
      const env: CacheEnvelopeV2 = {
        version: 2,
        conversationId,
        updatedAt: Date.now(),
        messages: trimMessages(messages),
        encrypted: false,
      };
      localStorage.setItem(cacheKey(conversationId), JSON.stringify(env));
      console.warn('⚠️ 加密失败，已降级为明文存储');
    } catch {
      // 彻底失败：放弃缓存
      console.error('❌ 缓存写入彻底失败');
    }
  }
}

// ===================== 辅助函数 =====================

function trimMessages(
  messages: CachedMessage[],
  maxMessages: number = MAX_MESSAGES_TO_KEEP,
  maxUnsynced: number = MAX_UNSYNCED_TO_KEEP
) {
  if (messages.length <= maxMessages && countUnsynced(messages) <= maxUnsynced) {
    return messages;
  }
  
  const recent = messages.slice(-maxMessages);
  const unsynced = recent.filter((m) => m.pendingSync);
  
  if (unsynced.length <= maxUnsynced) return recent;
  
  const keepUnsyncedIds = new Set(unsynced.slice(-maxUnsynced).map((m) => m.id));
  return recent.filter((m) => !m.pendingSync || keepUnsyncedIds.has(m.id));
}

function countUnsynced(messages: CachedMessage[]) {
  return messages.reduce((acc, m) => (m.pendingSync ? acc + 1 : acc), 0);
}

/**
 * 服务端消息与本地缓存合并
 */
export function mergeServerMessagesWithCache(
  serverMessages: CachedMessage[],
  cachedMessages: CachedMessage[]
): CachedMessage[] {
  const serverById = new Set(serverMessages.map((m) => m.id));
  const serverByClientId = new Set(
    serverMessages.map((m) => m.clientMessageId).filter(Boolean) as string[]
  );
  
  const localPending = cachedMessages.filter((m) => m.pendingSync);
  const keepPending: CachedMessage[] = [];
  
  for (const m of localPending) {
    if (serverById.has(m.id)) continue;
    if (serverByClientId.has(m.id)) continue;
    
    const matched = serverMessages.some((s) => isRoughSameMessage(s, m));
    if (!matched) keepPending.push(m);
  }
  
  const merged = [...serverMessages, ...keepPending].sort(
    (a, b) => a.timestamp - b.timestamp
  );
  return trimMessages(merged);
}

function isRoughSameMessage(a: CachedMessage, b: CachedMessage) {
  if (a.role !== b.role) return false;
  if ((a.content || '').trim() !== (b.content || '').trim()) return false;
  
  const dt = Math.abs(a.timestamp - b.timestamp);
  return dt < 5 * 60 * 1000;
}

// ===================== 清理和维护 =====================

/**
 * 清除指定对话的缓存
 */
export function clearConversationCache(conversationId: string): void {
  localStorage.removeItem(cacheKey(conversationId));
  localStorage.removeItem(`${LEGACY_PREFIX_V1}${conversationId}`);
  localStorage.removeItem(`${LEGACY_PREFIX_OLD}${conversationId}`);
  console.log(`🗑️ 已清除对话缓存: ${conversationId}`);
}

/**
 * 清除所有对话缓存
 */
export function clearAllConversationCaches(): void {
  const keys = Object.keys(localStorage);
  let count = 0;
  
  for (const key of keys) {
    if (
      key.startsWith(CACHE_PREFIX) ||
      key.startsWith(LEGACY_PREFIX_V1) ||
      key.startsWith(LEGACY_PREFIX_OLD)
    ) {
      localStorage.removeItem(key);
      count++;
    }
  }
  
  console.log(`🗑️ 已清除 ${count} 个对话缓存`);
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats(): {
  totalCaches: number;
  encryptedCaches: number;
  plaintextCaches: number;
  totalSize: number;
} {
  const keys = Object.keys(localStorage);
  let totalCaches = 0;
  let encryptedCaches = 0;
  let plaintextCaches = 0;
  let totalSize = 0;
  
  for (const key of keys) {
    if (!key.startsWith(CACHE_PREFIX)) continue;
    
    totalCaches++;
    const value = localStorage.getItem(key);
    if (!value) continue;
    
    totalSize += value.length;
    
    const data = safeParseJson<any>(value);
    if (data?.encrypted) {
      encryptedCaches++;
    } else {
      plaintextCaches++;
    }
  }
  
  return {
    totalCaches,
    encryptedCaches,
    plaintextCaches,
    totalSize,
  };
}

/**
 * 显示缓存信息（调试用）
 */
export function showCacheInfo(): void {
  const stats = getCacheStats();
  
  console.log(`
📊 对话缓存统计
━━━━━━━━━━━━━━━━━━━━━━━━━
总缓存数: ${stats.totalCaches}
├── 🔐 已加密: ${stats.encryptedCaches}
└── 📄 明文: ${stats.plaintextCaches}

总大小: ${(stats.totalSize / 1024).toFixed(2)} KB
平均大小: ${stats.totalCaches > 0 ? (stats.totalSize / stats.totalCaches / 1024).toFixed(2) : 0} KB/个

加密状态: ${ENCRYPTION_ENABLED ? '✅ 已启用' : '❌ 已禁用'}
━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
}

