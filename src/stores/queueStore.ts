import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { crossTabTabId } from '../utils/events/crossTabChannel';

// 队列按 tab 隔离，避免多 tab 误消费同一队列导致重复发送
const LEGACY_QUEUE_STORAGE_KEY = 'ai_agent_message_queue';
const QUEUE_STORAGE_KEY = `ai_agent_message_queue_${crossTabTabId}`;

function loadQueueFromStorage(): QueueItem[] {
  try {
    const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (stored) return JSON.parse(stored);

    // 兼容旧版本：首次找不到新 key 时，从旧 key 迁移一次
    const legacyStored = localStorage.getItem(LEGACY_QUEUE_STORAGE_KEY);
    if (legacyStored) {
      localStorage.setItem(QUEUE_STORAGE_KEY, legacyStored);
      localStorage.removeItem(LEGACY_QUEUE_STORAGE_KEY);
      return JSON.parse(legacyStored);
    }

    return [];
  } catch {
    return [];
  }
}

function saveQueueToStorage(queue: QueueItem[]) {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('保存队列失败:', e);
  }
}

export interface QueueItem {
  id: string;
  content: string;
  userMessageId: string; // 关联的用户消息 ID
  timestamp: number;
  retryCount: number;
}

export interface QueueWaitingLock {
  userId: string;
  conversationId: string;
}

interface QueueState {
  queue: QueueItem[];
  isProcessing: boolean;
  isOnline: boolean;
  queueToken: string | null; // 服务端队列 token
  waitingLock: QueueWaitingLock | null;
  activeQueueItemId: string | null;

  // Actions
  enqueue: (content: string, userMessageId: string) => void;
  dequeue: (id: string) => void;
  setProcessing: (processing: boolean) => void;
  setOnline: (online: boolean) => void;
  setQueueToken: (token: string | null) => void;
  setWaitingLock: (lock: QueueWaitingLock | null) => void;
  setActiveQueueItemId: (id: string | null) => void;
  clearQueue: () => void;
}

export const useQueueStore = create<QueueState>()(
  immer((set, get) => ({
    queue: loadQueueFromStorage(), // ✅ 初始化时从 localStorage 加载
    isProcessing: false,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true, // ⚠️ 建议在组件中使用 useOnlineStatus hook 同步
    queueToken: null,
    waitingLock: null,
    activeQueueItemId: null,

    enqueue: (content, userMessageId) => {
      set((state) => {
        state.queue.push({
          id: `queue_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          content,
          userMessageId,
          timestamp: Date.now(),
          retryCount: 0,
        });
      });

      // 每次修改后保存到 localStorage
      saveQueueToStorage(get().queue);
      console.log('消息已加入队列:', content.slice(0, 30));
    },

    dequeue: (id) => {
      set((state) => {
        state.queue = state.queue.filter((item) => item.id !== id);
      });

      // 每次修改后保存到 localStorage
      saveQueueToStorage(get().queue);
      console.log('消息已从队列移除:', id);
    },

    setProcessing: (processing) => set({ isProcessing: processing }),
    setOnline: (online) => set({ isOnline: online }),
    setQueueToken: (token) => set({ queueToken: token }),
    setWaitingLock: (lock) => set({ waitingLock: lock }),
    setActiveQueueItemId: (id) => set({ activeQueueItemId: id }),

    clearQueue: () => {
      set({ queue: [], waitingLock: null, activeQueueItemId: null });
      localStorage.removeItem(QUEUE_STORAGE_KEY);
    },
  }))
);

// 监听网络状态，自动更新 store
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useQueueStore.getState().setOnline(true);
    console.log('✅ 网络已恢复');
  });

  window.addEventListener('offline', () => {
    useQueueStore.getState().setOnline(false);
    console.log('⚠️ 网络已断开');
  });
}

