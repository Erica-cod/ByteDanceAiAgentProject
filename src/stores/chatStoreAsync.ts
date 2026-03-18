/**
 * chatStore 异步 Actions
 *
 * loadConversation / loadOlderMessages / saveToCache
 * 从 chatStore 主体中拆分，减少单文件复杂度。
 */

import type { Message } from '@/types/message';
import {
  readConversationCache,
  writeConversationCache,
  mergeServerMessagesWithCache,
  type CachedMessage,
} from '../utils/conversation/secureConversationCache';
import { getConversationMessages } from '../utils/conversation/conversationAPI';
import { touchConversationCache, smartCleanupConversationCache } from '../utils/storage/localStorageLRU';
import { CONVERSATION_PAGE_SIZE } from '@/constants';

interface ChatStoreGetter {
  (): {
    conversationId: string | null;
    isLoadingMore: boolean;
    hasMoreMessages: boolean;
    messages: Message[];
    totalMessages: number;
    userId: string;
  };
}

interface ChatStoreSetter {
  (partial: Record<string, any>): void;
  (fn: (state: any) => void): void;
}

export function createAsyncActions(set: ChatStoreSetter, get: ChatStoreGetter) {
  return {
    loadConversation: async (convId: string) => {
      try {
        console.log('从缓存加载对话:', convId);
        const { userId } = get();

        touchConversationCache(convId, 0);

        const cached = await readConversationCache(convId);
        if (cached.length > 0) {
          const cachedMessages: Message[] = cached.map((m) => ({
            id: m.id,
            clientMessageId: m.clientMessageId,
            role: m.role,
            content: m.content,
            thinking: m.thinking,
            sources: m.sources as any,
            timestamp: m.timestamp,
            pendingSync: m.pendingSync,
          }));
          set({
            messages: cachedMessages,
            conversationId: convId,
            firstItemIndex: 0,
          });
        }

        const result = await getConversationMessages(userId, convId, CONVERSATION_PAGE_SIZE, 0);
        console.log('首屏消息数据:', result);

        set({ totalMessages: result.total });

        const actualSkip = Math.max(0, result.total - CONVERSATION_PAGE_SIZE);
        const needLoadMore = result.total > CONVERSATION_PAGE_SIZE;

        const finalResult = needLoadMore
          ? await getConversationMessages(userId, convId, CONVERSATION_PAGE_SIZE, actualSkip)
          : result;

        console.log('消息统计:', {
          total: result.total,
          loaded: finalResult.messages.length,
          skip: actualSkip,
          hasMore: needLoadMore,
        });

        const serverForCache: CachedMessage[] = finalResult.messages.map((msg) => ({
          id: msg.messageId,
          clientMessageId: msg.clientMessageId,
          role: msg.role,
          content: msg.content,
          thinking: msg.thinking,
          sources: msg.sources as any,
          timestamp: new Date(msg.timestamp).getTime(),
        }));

        const merged = mergeServerMessagesWithCache(serverForCache, cached);

        const mergedForUI: Message[] = merged.map((m) => ({
          id: m.id,
          clientMessageId: m.clientMessageId,
          role: m.role,
          content: m.content,
          thinking: m.thinking,
          sources: m.sources as any,
          timestamp: m.timestamp,
          pendingSync: m.pendingSync,
        }));

        set({
          messages: mergedForUI,
          conversationId: convId,
          firstItemIndex: actualSkip,
          hasMoreMessages: needLoadMore,
        });

        await writeConversationCache(convId, merged);
        touchConversationCache(convId, merged.length);
        setTimeout(() => smartCleanupConversationCache(userId), 0);
      } catch (error) {
        console.error('加载对话失败:', error);
        set({
          messages: [],
          firstItemIndex: 0,
          hasMoreMessages: false,
        });
      }
    },

    loadOlderMessages: async () => {
      const { conversationId, isLoadingMore, hasMoreMessages, messages, totalMessages, userId } = get();
      if (!conversationId || isLoadingMore || !hasMoreMessages) return;

      set({ isLoadingMore: true });

      try {
        const currentLoaded = messages.length;
        const skip = Math.max(0, totalMessages - currentLoaded - CONVERSATION_PAGE_SIZE);

        console.log('加载更早消息:', { skip, limit: CONVERSATION_PAGE_SIZE, currentLoaded, totalMessages });

        const result = await getConversationMessages(userId, conversationId, CONVERSATION_PAGE_SIZE, skip);

        if (result.messages.length === 0) {
          set({ hasMoreMessages: false, isLoadingMore: false });
          return;
        }

        const olderMessages: Message[] = result.messages.map((msg) => ({
          id: msg.messageId,
          role: msg.role,
          content: msg.content,
          thinking: msg.thinking,
          sources: msg.sources,
          timestamp: new Date(msg.timestamp).getTime(),
        }));

        set((state: any) => {
          state.messages = [...olderMessages, ...state.messages];
          state.firstItemIndex = state.firstItemIndex - olderMessages.length;
          state.hasMoreMessages = skip > 0;
        });

        console.log('已加载更早消息:', olderMessages.length, '条，还有更多:', skip > 0);
      } catch (error) {
        console.error('加载更早消息失败:', error);
      } finally {
        set({ isLoadingMore: false });
      }
    },

    saveToCache: async () => {
      const { conversationId, messages } = get();
      if (!conversationId) return;

      const cached: CachedMessage[] = messages.map((m) => ({
        id: m.id,
        clientMessageId: m.clientMessageId,
        role: m.role,
        content: m.content,
        thinking: m.thinking,
        sources: m.sources as any,
        timestamp: m.timestamp,
        pendingSync: m.pendingSync,
      }));

      await writeConversationCache(conversationId, cached);
    },
  };
}
