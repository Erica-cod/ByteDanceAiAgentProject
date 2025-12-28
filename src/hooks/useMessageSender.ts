import { useChatStore, useUIStore } from '../stores';
import { useSSEStream } from './useSSEStream';

interface UseMessageSenderOptions {
  messageCountRefs?: React.MutableRefObject<Map<string, HTMLElement>>;
  virtuosoRef?: React.RefObject<any>;
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

  // 核心发送逻辑
  const sendMessageInternal = async (messageText: string, existingUserMessageId?: string) => {
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
      saveToCache();
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

    // ✅ 滚动到底部（使用最新的消息数量）
    const virtuosoRef = options.virtuosoRef;
    if (virtuosoRef?.current) {
      requestAnimationFrame(() => {
        const currentMessages = useChatStore.getState().messages;
        virtuosoRef.current?.scrollToIndex({
          index: currentMessages.length - 1,
          align: 'end',
          behavior: 'smooth',
        });
      });
    }

    try {
      await sendSSEMessage(
        messageText,
        userMessage.id,
        assistantMessageId,
        options.messageCountRefs
      );
    } finally {
      setLoading(false);
    }
  };

  // 重发失败的消息
  const retryMessage = async (userMessageId: string) => {
    const messages = useChatStore.getState().messages;
    const userMsg = messages.find((m) => m.id === userMessageId);
    if (!userMsg || userMsg.role !== 'user') return;

    console.log('🔄 重发消息:', userMsg.content);

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
  };

  return {
    sendMessageInternal,
    retryMessage,
    abort,
  };
}

