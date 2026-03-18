/**
 * useCrossTabSync - 跨标签页事件同步 Hook
 *
 * 监听跨 Tab 的对话更新/发送锁释放事件，
 * 同步会话列表和未读状态。
 */

import { useEffect, useCallback, useRef } from 'react';
import { useChatStore, useUIStore } from '@/stores';
import { subscribeCrossTabEvents } from '@/utils/events/crossTabChannel';
import { useThrottle } from '@/hooks/interaction';

interface UseCrossTabSyncOptions {
  loadConversations: () => Promise<void>;
  processQueueOnce: () => void;
  waitingLock: { userId: string; conversationId: string } | null;
  setWaitingLock: (lock: { userId: string; conversationId: string } | null) => void;
}

export function useCrossTabSync(opts: UseCrossTabSyncOptions) {
  const conversationId = useChatStore((s) => s.conversationId);
  const markConversationUnread = useChatStore((s) => s.markConversationUnread);
  const isLoading = useUIStore((s) => s.isLoading);
  const pendingConversationListSyncRef = useRef(false);

  const throttledLoadConversations = useThrottle(() => {
    opts.loadConversations().catch((error) => {
      console.error('跨 tab 刷新对话列表失败:', error);
    });
  }, 1000);

  useEffect(() => {
    const unsubscribe = subscribeCrossTabEvents((event) => {
      if (event.type === 'conversation_list_updated') {
        pendingConversationListSyncRef.current = true;
        if (!isLoading) {
          throttledLoadConversations();
          pendingConversationListSyncRef.current = false;
        }
        return;
      }

      if (event.type === 'conversation_send_released') {
        if (!opts.waitingLock) return;
        if (
          opts.waitingLock.userId === event.userId
          && opts.waitingLock.conversationId === event.conversationId
        ) {
          opts.setWaitingLock(null);
          opts.processQueueOnce();
        }
        return;
      }

      if (event.type !== 'conversation_updated') return;
      if (event.conversationId !== conversationId) {
        markConversationUnread(event.conversationId);
      }
    });
    return () => unsubscribe();
  }, [
    conversationId, markConversationUnread,
    opts.waitingLock, opts.setWaitingLock, opts.processQueueOnce,
    isLoading, throttledLoadConversations,
  ]);

  // 流式结束后补一次会话列表同步
  useEffect(() => {
    if (isLoading) return;
    if (!pendingConversationListSyncRef.current) return;
    throttledLoadConversations();
    pendingConversationListSyncRef.current = false;
  }, [isLoading, throttledLoadConversations]);
}
