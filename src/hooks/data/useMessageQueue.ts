import { useEffect } from 'react';
import { useQueueStore, useChatStore, useUIStore } from '../../stores';

interface UseMessageQueueOptions {
  onProcessQueue: () => Promise<void>;
}

export function useMessageQueue(options: UseMessageQueueOptions) {
  const queue = useQueueStore((s) => s.queue);
  const isOnline = useQueueStore((s) => s.isOnline);
  const isLoading = useUIStore((s) => s.isLoading);

  const enqueue = useQueueStore((s) => s.enqueue);
  const dequeue = useQueueStore((s) => s.dequeue);

  const addMessage = useChatStore((s) => s.addMessage);

  // 网络恢复时自动处理队列
  useEffect(() => {
    if (isOnline && queue.length > 0 && !isLoading) {
      console.log('✅ 网络恢复，自动处理队列');
      options.onProcessQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // 处理消息队列
  const processMessageQueue = async (
    sendMessageFn: (content: string, userMessageId: string) => Promise<void>
  ) => {
    if (queue.length === 0 || isLoading) return;

    console.log('📤 开始处理消息队列，当前队列长度:', queue.length);

    for (const item of [...queue]) {
      if (!isOnline) {
        console.log('⚠️ 网络断开，停止处理队列');
        break;
      }

      try {
        await sendMessageFn(item.content, item.userMessageId);
        dequeue(item.id);
      } catch (error) {
        console.error('❌ 队列消息发送失败，停止处理队列', error);
        break;
      }
    }
  };

  // 添加到队列
  const addToQueue = (content: string) => {
    if (content.trim()) {
      const queuedUserMessage = {
        id: `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        role: 'user' as const,
        content,
        timestamp: Date.now(),
        pendingSync: true,
      };

      addMessage(queuedUserMessage);
      enqueue(content, queuedUserMessage.id);

      console.log('📥 消息已加入队列，等待当前任务完成后发送');
      return true;
    }
    return false;
  };

  return {
    queue,
    isOnline,
    processMessageQueue,
    addToQueue,
    dequeue,
  };
}

