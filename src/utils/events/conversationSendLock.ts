export const CONVERSATION_SEND_LOCK_ERROR_CODE = 'CONVERSATION_SEND_LOCKED';

const LOCK_KEY_PREFIX = 'ai_agent_conversation_send_lock';
const DEFAULT_LOCK_TTL_MS = 45_000;

export interface ConversationSendLock {
  key: string;
  userId: string;
  conversationId: string;
  ownerTabId: string;
  expiresAt: number;
}

function normalizeConversationId(conversationId?: string | null): string {
  return conversationId || '__new__';
}

function buildLockKey(userId: string, conversationId?: string | null): string {
  return `${LOCK_KEY_PREFIX}:${userId}:${normalizeConversationId(conversationId)}`;
}

function readLock(key: string): ConversationSendLock | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as ConversationSendLock;
  } catch {
    return null;
  }
}

function writeLock(lock: ConversationSendLock): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(lock.key, JSON.stringify(lock));
    return true;
  } catch {
    return false;
  }
}

export function tryAcquireConversationSendLock(
  userId: string,
  conversationId: string | null,
  ownerTabId: string,
  ttlMs: number = DEFAULT_LOCK_TTL_MS
): ConversationSendLock | null {
  if (typeof window === 'undefined') return null;

  const key = buildLockKey(userId, conversationId);
  const now = Date.now();
  const current = readLock(key);

  // 其他标签页仍持有有效锁，拒绝抢占
  if (current && current.ownerTabId !== ownerTabId && current.expiresAt > now) {
    return null;
  }

  const nextLock: ConversationSendLock = {
    key,
    userId,
    conversationId: normalizeConversationId(conversationId),
    ownerTabId,
    expiresAt: now + ttlMs,
  };

  if (!writeLock(nextLock)) return null;

  // 回读确认，避免并发写入导致的误判
  const afterWrite = readLock(key);
  if (!afterWrite || afterWrite.ownerTabId !== ownerTabId) {
    return null;
  }

  return afterWrite;
}

export function refreshConversationSendLock(
  lock: ConversationSendLock,
  ttlMs: number = DEFAULT_LOCK_TTL_MS
): boolean {
  if (typeof window === 'undefined') return false;

  const current = readLock(lock.key);
  if (!current) return false;
  if (current.ownerTabId !== lock.ownerTabId) return false;

  const nextLock: ConversationSendLock = {
    ...current,
    expiresAt: Date.now() + ttlMs,
  };

  return writeLock(nextLock);
}

export function releaseConversationSendLock(lock: ConversationSendLock): void {
  if (typeof window === 'undefined') return;

  const current = readLock(lock.key);
  if (!current) return;
  if (current.ownerTabId !== lock.ownerTabId) return;
  localStorage.removeItem(lock.key);
}
