/**
 * 对话消息本地缓存（localStorage）
 *
 * 目标：
 * 1. 切换对话时“秒开”：先从本地缓存渲染，再后台拉服务端权威数据对齐
 * 2. 支持“待同步消息”：网络断开/刷新时也能看到刚发的消息（标记 pendingSync）
 * 3. 服务端数据优先：一旦拉到 MongoDB 的消息列表，用去重合并后回写缓存
 */

export type CachedRole = 'user' | 'assistant';

export interface CachedMessage {
  /** 本地展示用的 id：服务端消息用 messageId；本地临时消息用 clientId */
  id: string;
  /** 服务端存储时携带的 clientMessageId（用于精确去重） */
  clientMessageId?: string;
  role: CachedRole;
  content: string;
  thinking?: string;
  sources?: Array<{ title: string; url: string }>;
  /** 时间戳（毫秒） */
  timestamp: number;
  /** 本地临时消息：还没确认已被服务端持久化 */
  pendingSync?: boolean;
}

interface CacheEnvelopeV1 {
  version: 1;
  conversationId: string;
  updatedAt: number;
  messages: CachedMessage[];
}

const CACHE_PREFIX = 'chat_cache_v1:';
const LEGACY_PREFIX = 'chat_'; // 兼容旧 key：chat_${conversationId}

const MAX_MESSAGES_TO_KEEP = 500;
const MAX_UNSYNCED_TO_KEEP = 50;

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

/**
 * 读取缓存（优先新版本，其次兼容旧版本）
 */
export function readConversationCache(conversationId: string): CachedMessage[] {
  // 新版本
  const v1 = safeParseJson<CacheEnvelopeV1>(localStorage.getItem(cacheKey(conversationId)));
  if (v1?.version === 1 && Array.isArray(v1.messages)) {
    return v1.messages;
  }

  // 旧版本：直接存的 messages 数组（ChatInterface 旧逻辑）
  const legacy = safeParseJson<any[]>(localStorage.getItem(`${LEGACY_PREFIX}${conversationId}`));
  if (Array.isArray(legacy)) {
    // 尝试转换成 CachedMessage
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
}

/**
 * 写入缓存（会做长度裁剪，避免 localStorage 膨胀）
 */
export function writeConversationCache(conversationId: string, messages: CachedMessage[]) {
  const trimmed = trimMessages(messages);
  const env: CacheEnvelopeV1 = {
    version: 1,
    conversationId,
    updatedAt: Date.now(),
    messages: trimmed,
  };

  try {
    localStorage.setItem(cacheKey(conversationId), JSON.stringify(env));
    // 同时写入 legacy key，避免回退版本读不到（可按需移除）
    localStorage.setItem(`${LEGACY_PREFIX}${conversationId}`, JSON.stringify(trimmed));
  } catch (e) {
    // localStorage 可能满了：尽量只保留最近的消息，避免页面崩
    try {
      const minimal = trimMessages(messages, 200, 10);
      localStorage.setItem(cacheKey(conversationId), JSON.stringify({ ...env, messages: minimal }));
      localStorage.setItem(`${LEGACY_PREFIX}${conversationId}`, JSON.stringify(minimal));
    } catch {
      // 放弃缓存
    }
  }
}

function trimMessages(
  messages: CachedMessage[],
  maxMessages: number = MAX_MESSAGES_TO_KEEP,
  maxUnsynced: number = MAX_UNSYNCED_TO_KEEP
) {
  if (messages.length <= maxMessages && countUnsynced(messages) <= maxUnsynced) return messages;

  // 保留尾部最近消息 + 少量未同步
  const recent = messages.slice(-maxMessages);
  const unsynced = recent.filter((m) => m.pendingSync);

  if (unsynced.length <= maxUnsynced) return recent;

  // 未同步太多：只保留最后 maxUnsynced 条未同步
  const keepUnsyncedIds = new Set(unsynced.slice(-maxUnsynced).map((m) => m.id));
  return recent.filter((m) => !m.pendingSync || keepUnsyncedIds.has(m.id));
}

function countUnsynced(messages: CachedMessage[]) {
  return messages.reduce((acc, m) => (m.pendingSync ? acc + 1 : acc), 0);
}

/**
 * 服务端消息与本地缓存合并：
 * - 以服务端为主（服务端消息一定保留）
 * - 本地 pendingSync 消息：如果服务端里找不到“近似匹配”，则保留
 */
export function mergeServerMessagesWithCache(
  serverMessages: CachedMessage[],
  cachedMessages: CachedMessage[]
): CachedMessage[] {
  const serverById = new Set(serverMessages.map((m) => m.id));
  const serverByClientId = new Set(
    serverMessages.map((m) => m.clientMessageId).filter(Boolean) as string[]
  );

  // 只考虑本地未同步消息
  const localPending = cachedMessages.filter((m) => m.pendingSync);

  const keepPending: CachedMessage[] = [];
  for (const m of localPending) {
    // 如果本地 id 恰好等于服务端 id（很少见），直接认为已同步
    if (serverById.has(m.id)) continue;

    // ✅ 精确匹配：如果服务端的 clientMessageId 命中了本地临时 id，认为已同步
    if (serverByClientId.has(m.id)) continue;

    // “近似匹配”认为已同步：同 role + content 相同 + 时间足够接近
    const matched = serverMessages.some((s) => isRoughSameMessage(s, m));
    if (!matched) keepPending.push(m);
  }

  const merged = [...serverMessages, ...keepPending].sort((a, b) => a.timestamp - b.timestamp);
  return trimMessages(merged);
}

function isRoughSameMessage(a: CachedMessage, b: CachedMessage) {
  if (a.role !== b.role) return false;
  if ((a.content || '').trim() !== (b.content || '').trim()) return false;

  // 时间容忍：5 分钟内
  const dt = Math.abs(a.timestamp - b.timestamp);
  return dt < 5 * 60 * 1000;
}


