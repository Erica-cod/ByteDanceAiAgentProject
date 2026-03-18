/**
 * MessageList - 消息列表（重构版）
 * 
 * 职责：管理虚拟列表和消息渲染
 * 重构改进：
 * - 使用 MessageItemRenderer 统一消息渲染
 * - 分离渲染逻辑和数据逻辑
 * - 代码更简洁，职责更清晰
 */

import React, { useRef, useImperativeHandle, useCallback, forwardRef, memo, useMemo } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { MessageItemRenderer } from './MessageItemRenderer';
import type { Message, MessageListHandle } from '@/types/message';
import type { QueueItem } from '@/stores/queueStore';
import { useChatStore } from '@/stores';
import { estimateMessageHeight } from '@/utils/message/messageHeightEstimator';
import styles from './MessageList.module.css';

interface MessageListProps {
  messages: Message[];
  queue: QueueItem[];
  firstItemIndex: number;
  hasMoreMessages: boolean;
  isLoadingMore: boolean;
  isLoading: boolean;
  thinkingEndRef: React.RefObject<HTMLDivElement>;
  onLoadOlder: () => void;
  onRetry: (userMessageId: string) => void;
}

export type { MessageListHandle } from '@/types/message';

const MessageListInner = forwardRef<MessageListHandle, MessageListProps>((props, ref) => {
  const {
    messages,
    queue,
    firstItemIndex,
    hasMoreMessages,
    isLoadingMore,
    isLoading,
    thinkingEndRef,
    onLoadOlder,
    onRetry,
  } = props;

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userId = useChatStore((s) => s.userId);
  const isAtBottomRef = useRef(true);

  const followOutput = useCallback(() => (isAtBottomRef.current ? 'auto' : false), []);

  const VirtuosoScroller = useMemo(() => {
    return React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function Scroller(props, scrollerRef) {
      const { className, ...rest } = props;
      return (
        <div
          {...rest}
          ref={scrollerRef}
          className={[styles['message-list-refactored__scroller'], className].filter(Boolean).join(' ')}
        />
      );
    });
  }, []);

  // 遮罩状态
  const [isTransitioning, setIsTransitioning] = React.useState(true);
  const [transitionOpacity, setTransitionOpacity] = React.useState(1);
  const hasInitialDataRef = useRef(false);
  const hasStartedFadeOutRef = useRef(false);
  const removeFallbackTimerRef = useRef<number | null>(null);
  const emptyConversationFallbackTimerRef = useRef<number | null>(null);

  const clearMaskTimers = useCallback(() => {
    if (removeFallbackTimerRef.current !== null) {
      window.clearTimeout(removeFallbackTimerRef.current);
      removeFallbackTimerRef.current = null;
    }
    if (emptyConversationFallbackTimerRef.current !== null) {
      window.clearTimeout(emptyConversationFallbackTimerRef.current);
      emptyConversationFallbackTimerRef.current = null;
    }
  }, []);

  const startMaskFadeOut = useCallback(() => {
    if (hasStartedFadeOutRef.current) return;
    hasStartedFadeOutRef.current = true;
    setTransitionOpacity(0);

    removeFallbackTimerRef.current = window.setTimeout(() => {
      setIsTransitioning(false);
    }, 500);
  }, []);
  
  React.useEffect(() => {
    clearMaskTimers();
    setIsTransitioning(true);
    setTransitionOpacity(1);
    hasInitialDataRef.current = false;
    hasStartedFadeOutRef.current = false;

    emptyConversationFallbackTimerRef.current = window.setTimeout(() => {
      startMaskFadeOut();
    }, 800);

    return clearMaskTimers;
  }, [clearMaskTimers, startMaskFadeOut]);
  
  React.useEffect(() => {
    if (messages.length > 0 && !hasInitialDataRef.current) {
      hasInitialDataRef.current = true;

      const rafId = window.requestAnimationFrame(() => {
        startMaskFadeOut();
      });

      return () => {
        window.cancelAnimationFrame(rafId);
      };
    }
  }, [messages.length, startMaskFadeOut]);

  useImperativeHandle(ref, () => ({
    scrollToRow: (index: number) => {
      virtuosoRef.current?.scrollToIndex({ index, align: 'end', behavior: 'auto' });
    },
    scrollToBottom: () => {
      if (messages.length > 0) {
        virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, align: 'end', behavior: 'auto' });
      }
    },
    recomputeRowHeights: (index?: number) => {
      void index;
    },
  }));

  // 高度缓存：存储已测量的消息实际高度，避免重新挂载时的高度跳变
  const heightCacheRef = useRef<Map<string, number>>(new Map());

  const itemContent = useCallback(
    (index: number) => {
      const message = messages[index];
      const queueItem = queue.find((q) => q.userMessageId === message.id);
      const cachedHeight = heightCacheRef.current.get(message.id);
      const minHeight = cachedHeight || estimateMessageHeight(message);

      return (
        <div
          className={styles['message-item-height-anchor']}
          style={{ minHeight }}
          ref={(el) => {
            if (!el) return;
            const measured = el.getBoundingClientRect().height;
            if (measured > 0) {
              heightCacheRef.current.set(message.id, measured);
            }
          }}
        >
          <MessageItemRenderer
            message={message}
            userId={userId}
            queuePosition={queueItem ? queue.indexOf(queueItem) + 1 : undefined}
            onRetry={(id) => {
              const msgIndex = messages.findIndex((m) => m.id === id);
              const prevUserMsg = messages[msgIndex - 1];
              if (prevUserMsg?.role === 'user') {
                onRetry(prevUserMsg.id);
              }
            }}
            onHeightChange={() => {
              void index;
            }}
          />
        </div>
      );
    },
    [messages, queue, userId, onRetry]
  );

  const noRowsRenderer = () => (
    <div className={styles['message-list-refactored__empty']}>
      <p>开始新的对话吧！</p>
    </div>
  );

  return (
    <div className={styles['message-list-refactored']} ref={scrollContainerRef}>
      {/* 遮罩 */}
      {isTransitioning && (
        <div
          className={styles['message-list-refactored__mask']}
          style={{ opacity: transitionOpacity }}
          onTransitionEnd={(event) => {
            if (event.propertyName !== 'opacity') return;
            if (!hasStartedFadeOutRef.current) return;
            clearMaskTimers();
            setIsTransitioning(false);
          }}
        />
      )}

      {/* 加载更多提示 */}
      {(isLoadingMore || hasMoreMessages) && messages.length > 0 && (
        <div className={styles['message-list-refactored__load-more']}>
          {isLoadingMore ? '加载中...' : '向上滚动加载更多'}
        </div>
      )}

      {/* 虚拟列表 */}
      {messages.length === 0 ? (
        noRowsRenderer()
      ) : (
        <Virtuoso
          ref={virtuosoRef}
          className={styles['message-list-refactored__virtuoso']}
          data={messages}
          itemContent={(index) => itemContent(index)}
          computeItemKey={(_, item) => item.id}
          initialTopMostItemIndex={messages.length - 1}
          followOutput={followOutput}
          atBottomStateChange={(isAtBottom) => {
            isAtBottomRef.current = isAtBottom;
          }}
          startReached={() => {
            if (hasMoreMessages && !isLoadingMore) {
              onLoadOlder();
            }
          }}
          defaultItemHeight={200}
          increaseViewportBy={{ top: 2000, bottom: 800 }}
          components={{
            Scroller: VirtuosoScroller,
            Footer: () => <div ref={thinkingEndRef} />,
            ScrollSeekPlaceholder: ({ height }) => (
              <div
                className={`${styles['message-item-height-anchor']} ${styles['message-item-seek-placeholder']}`}
                style={{ height, contain: 'strict' }}
              />
            ),
          }}
          scrollSeekConfiguration={{
            enter: (velocity) => Math.abs(velocity) > 1200,
            exit: (velocity) => Math.abs(velocity) < 150,
          }}
        />
      )}

      {/* 正在生成提示 */}
      {isLoading && (
        <div className={styles['message-list-refactored__loading']}>
          <div className={styles['typing-indicator']}>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      )}
    </div>
  );
});

MessageListInner.displayName = 'MessageList';

export default memo(MessageListInner);
