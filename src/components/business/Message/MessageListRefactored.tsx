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
import type { Message } from '../../../stores/chatStore';
import type { QueueItem } from '../../../stores/queueStore';
import { useChatStore } from '../../../stores';
import './MessageListRefactored.css';

interface MessageListRefactoredProps {
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

export interface MessageListRefactoredHandle {
  scrollToRow: (index: number) => void;
  scrollToBottom: () => void;
  recomputeRowHeights: (index?: number) => void;
}

const MessageListRefactoredInner = forwardRef<MessageListRefactoredHandle, MessageListRefactoredProps>((props, ref) => {
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

  // 关键：不要把 atBottom 放进 React state（会导致布局变化/输入变化触发频繁 setState → 列表闪烁）
  // 用 ref 记录即可，并提供一个稳定的 followOutput 回调。
  const followOutput = useCallback(() => (isAtBottomRef.current ? 'auto' : false), []);

  const VirtuosoScroller = useMemo(() => {
    return React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function Scroller(props, scrollerRef) {
      const { className, ...rest } = props;
      return (
        <div
          {...rest}
          ref={scrollerRef}
          className={['message-list-refactored__scroller', className].filter(Boolean).join(' ')}
        />
      );
    });
  }, []);

  // 遮罩状态
  const [isTransitioning, setIsTransitioning] = React.useState(true);
  const [transitionOpacity, setTransitionOpacity] = React.useState(1);
  const hasInitialDataRef = useRef(false);
  
  React.useEffect(() => {
    setIsTransitioning(true);
    setTransitionOpacity(1);
    hasInitialDataRef.current = false;
  }, []);
  
  // 监听数据加载状态
  React.useEffect(() => {
    if (messages.length > 0 && !hasInitialDataRef.current) {
      hasInitialDataRef.current = true;
      
      const fadeOutTimer = setTimeout(() => {
        setTransitionOpacity(0);
      }, 100);
      
      const removeTimer = setTimeout(() => {
        setIsTransitioning(false);
      }, 400);
      
      return () => {
        clearTimeout(fadeOutTimer);
        clearTimeout(removeTimer);
      };
    }
  }, [messages.length]);

  // 注意：不要在流式输出的每个 chunk 里主动 scrollToIndex。
  // 这会导致 Virtuoso 频繁布局 + 滚动联动，产生“闪烁/抖动”。
  // 我们只用 Virtuoso 自带 followOutput 来跟随底部，并用 atBottomStateChange 控制是否跟随。

  // 暴露方法
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
      // Virtuoso 会自动测量并处理动态高度，这里保留接口用于兼容调用方
      // 如果后续需要强制刷新，可通过 key 或 data 触发 Virtuoso 内部重算
      void index;
    },
  }));

  // Virtuoso item renderer
  const itemContent = useCallback(
    (index: number) => {
      const message = messages[index];
      const queueItem = queue.find((q) => q.userMessageId === message.id);

      return (
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
            // 流式输出会频繁触发高度变化；这里不主动滚动，交给 followOutput 处理。
            // 只有“用户在底部”时，Virtuoso 才会自动跟随到底部。
            void index;
          }}
        />
      );
    },
    [messages, queue, userId, onRetry]
  );

  // 空状态
  const noRowsRenderer = () => (
    <div className="message-list-refactored__empty">
      <p>开始新的对话吧！</p>
    </div>
  );

  return (
    <div className="message-list-refactored" ref={scrollContainerRef}>
      {/* 遮罩 */}
      {isTransitioning && (
        <div
          className="message-list-refactored__mask"
          style={{ opacity: transitionOpacity }}
        />
      )}

      {/* 加载更多提示 */}
      {(isLoadingMore || hasMoreMessages) && messages.length > 0 && (
        <div className="message-list-refactored__load-more">
          {isLoadingMore ? '加载中...' : '向上滚动加载更多'}
        </div>
      )}

      {/* 虚拟列表 */}
      {messages.length === 0 ? (
        noRowsRenderer()
      ) : (
        <Virtuoso
          ref={virtuosoRef}
          className="message-list-refactored__virtuoso"
          data={messages}
          itemContent={(index) => itemContent(index)}
          computeItemKey={(_, item) => item.id}
          // 关键：初始渲染从底部开始（聊天默认展示最新消息）
          initialTopMostItemIndex={messages.length - 1}
          // 关键：避免“流式输出想到底部却卡顶部”
          // - 只有在用户接近底部时才自动跟随
          followOutput={followOutput}
          atBottomStateChange={(isAtBottom) => {
            // atBottom = true 表示用户在底部；否则用户在看历史，不要抢滚动
            isAtBottomRef.current = isAtBottom;
          }}
          // 上拉加载历史：滚动到顶部触发
          startReached={() => {
            if (hasMoreMessages && !isLoadingMore) {
              onLoadOlder();
            }
          }}
          // 如果你们有“firstItemIndex”用于分页锚定，这里预留入口（当前实现先不强依赖它）
          // initialTopMostItemIndex={Math.max(0, firstItemIndex)}
          overscan={600}
          components={{
            Scroller: VirtuosoScroller,
            Footer: () => <div ref={thinkingEndRef} />,
          }}
        />
      )}

      {/* 正在生成提示 */}
      {isLoading && (
        <div className="message-list-refactored__loading">
          <div className="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      )}
    </div>
  );
});

MessageListRefactoredInner.displayName = 'MessageListRefactored';

export default memo(MessageListRefactoredInner);

