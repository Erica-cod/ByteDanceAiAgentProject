import { useCallback, useEffect } from 'react';
import { useQueueStore, useUIStore } from '../../stores';
import { CONVERSATION_SEND_LOCK_ERROR_CODE } from '../../utils/events/conversationSendLock';

interface UseMessageQueueOptions {
  onProcessQueue: () => Promise<void>;
}

export type ProcessQueueResult = 'idle' | 'processed' | 'blocked_by_lock' | 'offline' | 'error';

export function useMessageQueue(options: UseMessageQueueOptions) {
  const queue = useQueueStore((s) => s.queue);
  const isOnline = useQueueStore((s) => s.isOnline);
  const isProcessing = useQueueStore((s) => s.isProcessing);
  const waitingLock = useQueueStore((s) => s.waitingLock);
  const activeQueueItemId = useQueueStore((s) => s.activeQueueItemId);
  const isLoading = useUIStore((s) => s.isLoading);

  const enqueue = useQueueStore((s) => s.enqueue);
  const dequeue = useQueueStore((s) => s.dequeue);
  const setProcessing = useQueueStore((s) => s.setProcessing);
  const setWaitingLock = useQueueStore((s) => s.setWaitingLock);
  const setActiveQueueItemId = useQueueStore((s) => s.setActiveQueueItemId);

  // 网络恢复时自动处理队列
  useEffect(() => {
    if (isOnline && queue.length > 0 && !isLoading) {
      console.log('✅ 网络恢复，自动处理队列');
      options.onProcessQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // 处理消息队列
  const processMessageQueue = useCallback(async (
    sendMessageFn: (content: string, userMessageId?: string) => Promise<void>
  ): Promise<ProcessQueueResult> => {
    const queueState = useQueueStore.getState();
    const loadingNow = useUIStore.getState().isLoading;
    const queueSnapshot = [...queueState.queue];

    if (queueSnapshot.length === 0 || loadingNow || queueState.isProcessing) return 'idle';
    queueState.setProcessing(true);

    console.log('📤 开始处理消息队列，当前队列长度:', queueSnapshot.length);
    let result: ProcessQueueResult = 'processed';

    try {
      for (const item of queueSnapshot) {
        if (!useQueueStore.getState().isOnline) {
          console.log('⚠️ 网络断开，停止处理队列');
          result = 'offline';
          break;
        }

        try {
          // 标记当前队列项正在发送，用于 UI 立即从队列展示中隐藏
          setActiveQueueItemId(item.id);
          // 队列消息在真正发送时才写入消息流，避免“队列展示”和“消息流展示”双重显示
          await sendMessageFn(item.content);
          dequeue(item.id);
        } catch (error) {
          if ((error as { code?: string })?.code === CONVERSATION_SEND_LOCK_ERROR_CODE) {
            const lockUserId = (error as { lockUserId?: string }).lockUserId;
            const lockConversationId = (error as { lockConversationId?: string }).lockConversationId;
            if (lockUserId && lockConversationId) {
              setWaitingLock({
                userId: lockUserId,
                conversationId: lockConversationId,
              });
            }
            console.log('⏸️ 其他标签页正在生成，等待释放事件后再重试');
            result = 'blocked_by_lock';
            break;
          }
          console.error('❌ 队列消息发送失败，停止处理队列', error);
          result = 'error';
          break;
        } finally {
          setActiveQueueItemId(null);
        }
      }
    } finally {
      useQueueStore.getState().setProcessing(false);
    }

    if (result !== 'blocked_by_lock') {
      setWaitingLock(null);
    }

    return result;
  }, [dequeue, setActiveQueueItemId, setWaitingLock]);

  // 添加到队列
  const addToQueue = useCallback((content: string) => {
    if (content.trim()) {
      enqueue(content, `queued_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

      console.log('📥 消息已加入队列，等待当前任务完成后发送');
      return true;
    }
    return false;
  }, [enqueue]);

  return {
    queue,
    isOnline,
    isProcessing,
    waitingLock,
    activeQueueItemId,
    setWaitingLock,
    processMessageQueue,
    addToQueue,
    dequeue,
  };
}

