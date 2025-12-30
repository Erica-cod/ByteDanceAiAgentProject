/**
 * MessageList - 消息列表（重构版）
 * 
 * 职责：管理虚拟列表和消息渲染
 * 重构改进：
 * - 使用 MessageItemRenderer 统一消息渲染
 * - 分离渲染逻辑和数据逻辑
 * - 代码更简洁，职责更清晰
 */

import React, { useRef, useImperativeHandle, useCallback, forwardRef } from 'react';
import { List, CellMeasurer, CellMeasurerCache, AutoSizer } from 'react-virtualized';
import type { ListRowProps } from 'react-virtualized';
import { MessageItemRenderer } from './MessageItemRenderer';
import type { Message } from '../../../stores/chatStore';
import type { QueueItem } from '../../../stores/queueStore';
import { useChatStore } from '../../../stores';
import 'react-virtualized/styles.css';
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
}

const MessageListRefactored = forwardRef<MessageListRefactoredHandle, MessageListRefactoredProps>((props, ref) => {
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

  const listRef = useRef<List>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userId = useChatStore((s) => s.userId);
  
  // 缓存每行高度
  const cacheRef = useRef(
    new CellMeasurerCache({
      defaultHeight: 200,
      fixedWidth: true,
      minHeight: 120,
    })
  );

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

  // 暴露方法
  useImperativeHandle(ref, () => ({
    scrollToRow: (index: number) => {
      listRef.current?.scrollToRow(index);
    },
  }));

  // 滚动到底部
  React.useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        listRef.current?.scrollToRow(messages.length - 1);
      }, 100);
    }
  }, [messages.length]);

  // 滚动处理
  const handleScroll = useCallback(
    ({ scrollTop }: { scrollTop: number }) => {
      if (scrollTop < 100 && hasMoreMessages && !isLoadingMore) {
        onLoadOlder();
      }
    },
    [hasMoreMessages, isLoadingMore, onLoadOlder]
  );

  // 渲染单行
  const rowRenderer = useCallback(
    ({ index, key, parent, style }: ListRowProps) => {
      const message = messages[index];
      const queueItem = queue.find(q => q.userMessageId === message.id);

      return (
        <CellMeasurer
          key={key}
          cache={cacheRef.current}
          parent={parent}
          columnIndex={0}
          rowIndex={index}
        >
          {({ registerChild, measure }) => (
            <div
              ref={registerChild as any}
              style={style}
              onLoad={measure}
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
                  cacheRef.current.clear(index, 0);
                  measure();
                  listRef.current?.recomputeRowHeights(index);
                }}
              />
            </div>
          )}
        </CellMeasurer>
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
      <AutoSizer>
        {({ height, width }) => (
          <List
            ref={listRef}
            height={height - (isLoadingMore || hasMoreMessages || messages.length > 0 ? 40 : 0)}
            width={width}
            rowCount={messages.length}
            rowHeight={cacheRef.current.rowHeight}
            rowRenderer={rowRenderer}
            overscanRowCount={10}
            noRowsRenderer={noRowsRenderer}
            onScroll={handleScroll}
            scrollToAlignment="end"
            className="message-list-refactored__list"
            estimatedRowSize={800}
          />
        )}
      </AutoSizer>

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

MessageListRefactored.displayName = 'MessageListRefactored';

export default MessageListRefactored;

