import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  type CachedMessage,
} from '../utils/conversation/secureConversationCache';
import { getUserId } from '../utils/auth/userManager';
import { type Conversation } from '../utils/conversation/conversationAPI';
import { createEventManager } from '../utils/events/eventManager';
import { createAsyncActions } from './chatStoreAsync';

import { MAX_MESSAGES_IN_MEMORY } from '@/constants';
import type { Message } from '@/types/message';
export type { Message } from '@/types/message';

interface ChatState {
  // 状态
  messages: Message[];
  conversations: Conversation[];
  conversationId: string | null;
  userId: string;
  deviceId: string;
  firstItemIndex: number;
  hasMoreMessages: boolean;
  totalMessages: number;
  isLoadingMore: boolean;
  unreadConversationIds: string[];

  // 同步 Actions
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  removeMessage: (id: string) => void;
  setConversationId: (id: string | null) => void;
  setUserId: (userId: string) => void;
  setDeviceId: (deviceId: string) => void;
  setConversations: (conversations: Conversation[]) => void;
  setFirstItemIndex: (index: number) => void;
  setHasMoreMessages: (has: boolean) => void;
  setTotalMessages: (total: number) => void;
  setIsLoadingMore: (loading: boolean) => void;
  markConversationUnread: (conversationId: string) => void;
  clearConversationUnread: (conversationId: string) => void;

  // 流式更新优化
  appendToLastMessage: (contentDelta?: string, thinkingDelta?: string, sources?: Array<{ title: string; url: string }>) => void;
  markMessageFailed: (id: string) => void;
  markMessageSuccess: (id: string) => void;

  // 异步 Actions
  loadConversation: (convId: string) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  saveToCache: () => Promise<void>;
}

export const useChatStore = create<ChatState>()(
  immer((set, get) => {
    const asyncActions = createAsyncActions(set as any, get as any);

    return {
      // 初始状态
      messages: [],
      conversations: [],
      conversationId: null,
      userId: getUserId(),
      deviceId: '',
      firstItemIndex: 0,
      hasMoreMessages: false,
      totalMessages: 0,
      isLoadingMore: false,
      unreadConversationIds: [],

      // 同步 Actions
      setMessages: (messages) => {
        if (messages.length > MAX_MESSAGES_IN_MEMORY) {
          console.warn(`消息数量超过限制 (${messages.length} > ${MAX_MESSAGES_IN_MEMORY})，保留最新的消息`);
          set({ messages: messages.slice(-MAX_MESSAGES_IN_MEMORY) });
        } else {
          set({ messages });
        }
      },

      addMessage: (message) =>
        set((state) => {
          state.messages.push(message);
          if (state.messages.length > MAX_MESSAGES_IN_MEMORY) {
            const removed = state.messages.shift();
            console.warn(`内存保护：移除最早的消息 (ID: ${removed?.id})`);
          }
        }),

      updateMessage: (id, updates) =>
        set((state) => {
          const msg = state.messages.find((m) => m.id === id);
          if (msg) Object.assign(msg, updates);
        }),

      removeMessage: (id) =>
        set((state) => {
          state.messages = state.messages.filter((m) => m.id !== id);
        }),

      setConversationId: (id) =>
        set((state) => {
          state.conversationId = id;
          if (id) {
            state.unreadConversationIds = state.unreadConversationIds.filter((convId) => convId !== id);
          }
        }),
      setUserId: (userId) => set({ userId }),
      setDeviceId: (deviceId) => set({ deviceId }),
      setConversations: (conversations) => set({ conversations }),
      setFirstItemIndex: (index) => set({ firstItemIndex: index }),
      setHasMoreMessages: (has) => set({ hasMoreMessages: has }),
      setTotalMessages: (total) => set({ totalMessages: total }),
      setIsLoadingMore: (loading) => set({ isLoadingMore: loading }),
      markConversationUnread: (conversationId) =>
        set((state) => {
          if (!conversationId) return;
          if (!state.unreadConversationIds.includes(conversationId)) {
            state.unreadConversationIds.push(conversationId);
          }
        }),
      clearConversationUnread: (conversationId) =>
        set((state) => {
          state.unreadConversationIds = state.unreadConversationIds.filter((id) => id !== conversationId);
        }),

      // 流式更新优化
      appendToLastMessage: (contentDelta, thinkingDelta, sources) =>
        set((state) => {
          const last = state.messages[state.messages.length - 1];
          if (last && last.role === 'assistant') {
            if (contentDelta !== undefined) last.content = contentDelta;
            if (thinkingDelta !== undefined) last.thinking = thinkingDelta;
            if (sources !== undefined) last.sources = sources;
          }
        }),

      markMessageFailed: (id) =>
        set((state) => {
          const msg = state.messages.find((m) => m.id === id);
          if (msg) {
            msg.failed = true;
            msg.retryCount = (msg.retryCount || 0) + 1;
            msg.pendingSync = false;
          }
        }),

      markMessageSuccess: (id) =>
        set((state) => {
          const msg = state.messages.find((m) => m.id === id);
          if (msg) {
            msg.failed = false;
            msg.pendingSync = false;
          }
        }),

      // 异步 Actions（从 chatStoreAsync.ts 引入）
      ...asyncActions,
    };
  }),
);

// 多窗口同步
const chatEventManager = createEventManager();

if (typeof window !== 'undefined') {
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key?.startsWith('conv_')) {
      const convId = e.key.replace('conv_', '');
      const currentConvId = useChatStore.getState().conversationId;
      if (convId === currentConvId && e.newValue) {
        try {
          const newMessages = JSON.parse(e.newValue) as CachedMessage[];
          const messagesForUI: Message[] = newMessages.map((m) => ({
            id: m.id,
            clientMessageId: m.clientMessageId,
            role: m.role,
            content: m.content,
            thinking: m.thinking,
            sources: m.sources as any,
            timestamp: m.timestamp,
            pendingSync: m.pendingSync,
          }));
          useChatStore.getState().setMessages(messagesForUI);
          console.log('检测到其他标签页更新，已同步消息');
        } catch (err) {
          console.error('同步消息失败:', err);
        }
      }
    }
  };

  chatEventManager.addEventListener(window, 'storage', handleStorageChange);
}

export { chatEventManager };
