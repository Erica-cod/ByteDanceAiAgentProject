/**
 * useCrossTabSync - 跨标签页事件同步 Hook
 *
 * 监听跨 Tab 的对话更新/发送锁释放事件，
 * 同步会话列表和未读状态。
 *
 * 使用 useRef 持有最新状态，BroadcastChannel 订阅只绑定一次，
 * 避免 isLoading / waitingLock 等高频变化导致反复拆装监听。
 */

import { useEffect, useRef } from 'react';
import { useChatStore, useUIStore } from '@/stores';
import { subscribeCrossTabEvents } from '@/utils/events/crossTabChannel';
import { useThrottle } from '@/hooks';

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

  // 用 ref 持有最新值，避免 BroadcastChannel 回调闭包陈旧
  const stateRef = useRef({
    conversationId,
    isLoading,
    waitingLock: opts.waitingLock,
    setWaitingLock: opts.setWaitingLock,
    processQueueOnce: opts.processQueueOnce,
    markConversationUnread,
    throttledLoadConversations,
  });

  useEffect(() => {
    stateRef.current = {
      conversationId,
      isLoading,
      waitingLock: opts.waitingLock,
      setWaitingLock: opts.setWaitingLock,
      processQueueOnce: opts.processQueueOnce,
      markConversationUnread,
      throttledLoadConversations,
    };
  });

  // BroadcastChannel 只订阅一次
  useEffect(() => {
    const unsubscribe = subscribeCrossTabEvents((event) => {
      const s = stateRef.current;

      if (event.type === 'conversation_list_updated') {
        pendingConversationListSyncRef.current = true;
        if (!s.isLoading) {
          s.throttledLoadConversations();
          pendingConversationListSyncRef.current = false;
        }
        return;
      }

      if (event.type === 'conversation_send_released') {
        if (!s.waitingLock) return;
        if (
          s.waitingLock.userId === event.userId
          && s.waitingLock.conversationId === event.conversationId
        ) {
          s.setWaitingLock(null);
          s.processQueueOnce();
        }
        return;
      }

      if (event.type !== 'conversation_updated') return;
      if (event.conversationId !== s.conversationId) {
        s.markConversationUnread(event.conversationId);
      }
    });
    return () => unsubscribe();
  }, []); // 依赖为空，只绑定一次

  // 流式结束后补一次会话列表同步
  useEffect(() => {
    if (isLoading) return;
    if (!pendingConversationListSyncRef.current) return;
    throttledLoadConversations();
    pendingConversationListSyncRef.current = false;
  }, [isLoading, throttledLoadConversations]);
}
