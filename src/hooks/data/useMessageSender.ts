import { useCallback, useRef } from 'react';
import { useChatStore, useUIStore } from '../../stores';
import { useSSEStream } from './useSSEStream';
import type { MessageListRefactoredHandle as MessageListHandle } from '../../components/business/Message/MessageListRefactored';
import { crossTabTabId, publishConversationSendReleased } from '../../utils/events/crossTabChannel';
import {
  CONVERSATION_SEND_LOCK_ERROR_CODE,
  type ConversationSendLock,
  tryAcquireConversationSendLock,
  refreshConversationSendLock,
  releaseConversationSendLock,
} from '../../utils/events/conversationSendLock';

interface UseMessageSenderOptions {
  messageCountRefs?: React.MutableRefObject<Map<string, HTMLElement>>;
  listRef?: React.RefObject<MessageListHandle>;
  onConversationCreated?: (convId: string) => void;
}

export function useMessageSender(options: UseMessageSenderOptions = {}) {
  const addMessage = useChatStore((s) => s.addMessage);
  const removeMessage = useChatStore((s) => s.removeMessage);
  const saveToCache = useChatStore((s) => s.saveToCache);

  const setLoading = useUIStore((s) => s.setLoading);

  const { sendMessage: sendSSEMessage, createAbortController, abort } = useSSEStream({
    onConversationCreated: options.onConversationCreated,
  });
  const activeLockRef = useRef<ConversationSendLock | null>(null);
  const lockHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const releaseActiveLock = useCallback(() => {
    if (lockHeartbeatRef.current) {
      clearInterval(lockHeartbeatRef.current);
      lockHeartbeatRef.current = null;
    }
    if (activeLockRef.current) {
      publishConversationSendReleased(
        activeLockRef.current.userId,
        activeLockRef.current.conversationId
      );
      releaseConversationSendLock(activeLockRef.current);
      activeLockRef.current = null;
    }
  }, []);

  // 核心发送逻辑
  const sendMessageInternal = useCallback(async (messageText: string, existingUserMessageId?: string) => {
    const { userId, conversationId } = useChatStore.getState();
    const acquiredLock = tryAcquireConversationSendLock(
      userId,
      conversationId,
      crossTabTabId
    );

    if (!acquiredLock) {
      const lockError = new Error('当前对话正在其他标签页生成，请稍后再试');
      (lockError as Error & { code?: string; lockUserId?: string; lockConversationId?: string }).code = CONVERSATION_SEND_LOCK_ERROR_CODE;
      (lockError as Error & { code?: string; lockUserId?: string; lockConversationId?: string }).lockUserId = userId;
      (lockError as Error & { code?: string; lockUserId?: string; lockConversationId?: string }).lockConversationId = conversationId || '__new__';
      throw lockError;
    }

    activeLockRef.current = acquiredLock;
    lockHeartbeatRef.current = setInterval(() => {
      if (activeLockRef.current) {
        refreshConversationSendLock(activeLockRef.current);
      }
    }, 10_000);

    let userMessage;

    if (existingUserMessageId) {
      // 重发：复用现有消息
      const messages = useChatStore.getState().messages;
      userMessage = messages.find((m) => m.id === existingUserMessageId);
      if (!userMessage) return;
    } else {
      // 新消息：创建并添加
      userMessage = {
        id: `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        role: 'user' as const,
        content: messageText,
        timestamp: Date.now(),
        pendingSync: true,
      };
      addMessage(userMessage);
      // 异步保存到加密缓存（不阻塞）
      saveToCache().catch(err => console.error('保存缓存失败:', err));
    }

    setLoading(true);

    // 创建新的 AbortController
    createAbortController();

    // 创建助手消息占位符
    const assistantMessageId = `client_${Date.now() + 1}_${Math.random().toString(36).slice(2, 8)}`;

    const assistantMessage = {
      id: assistantMessageId,
      role: 'assistant' as const,
      content: '',
      timestamp: Date.now(),
      pendingSync: true,
    };

    addMessage(assistantMessage);

    //  虚拟列表会在 MessageList 内部处理首次滚动（当前实现基于 react-virtuoso）
    // 不需要在这里手动滚动

    try {
      await sendSSEMessage(
        messageText,
        userMessage.id,
        assistantMessageId,
        options.messageCountRefs
      );
    } finally {
      setLoading(false);
      releaseActiveLock();
    }
  }, [
    addMessage,
    createAbortController,
    options.messageCountRefs,
    removeMessage,
    releaseActiveLock,
    saveToCache,
    sendSSEMessage,
    setLoading,
  ]);

  // 重发失败的消息
  const retryMessage = useCallback(async (userMessageId: string) => {
    const messages = useChatStore.getState().messages;
    const userMsg = messages.find((m) => m.id === userMessageId);
    if (!userMsg || userMsg.role !== 'user') return;

    console.log('重发消息:', userMsg.content);

    // 移除失败的 assistant 消息（如果有）
    const userMsgIndex = messages.findIndex((m) => m.id === userMessageId);
    if (userMsgIndex !== -1) {
      const nextMsg = messages[userMsgIndex + 1];
      if (nextMsg?.role === 'assistant' && nextMsg.failed) {
        removeMessage(nextMsg.id);
      }
    }

    // 重新发送
    await sendMessageInternal(userMsg.content, userMsg.id);
  }, [removeMessage, sendMessageInternal]);

  return {
    sendMessageInternal,
    retryMessage,
    abort: useCallback(() => {
      releaseActiveLock();
      abort();
    }, [abort, releaseActiveLock]),
  };
}

