import React, { useRef } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import StreamingMarkdown from './StreamingMarkdown';
import MultiAgentDisplay from './MultiAgentDisplay';
import type { Message } from '../stores/chatStore';
import type { QueueItem } from '../stores/queueStore';

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

// 来源链接组件
const SourceLinks: React.FC<{ sources: Array<{ title: string; url: string }> }> = ({ sources }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  return (
    <div className="source-links-container">
      <button className="source-links-toggle" onClick={() => setIsExpanded(!isExpanded)}>
        <span className="source-icon">🔗</span>
        <span className="source-text">来源链接 ({sources.length})</span>
        <span className={`source-arrow ${isExpanded ? 'expanded' : ''}`}>▼</span>
      </button>
      {isExpanded && (
        <div className="source-links-list">
          {sources.map((source, index) => (
            <a
              key={index}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="source-link-item"
            >
              <span className="source-number">{index + 1}</span>
              <span className="source-title">{source.title}</span>
              <span className="source-external">↗</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

const MessageList = React.forwardRef<VirtuosoHandle, MessageListProps>((props, ref) => {
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

  return (
    <Virtuoso
      ref={ref}
      style={{ height: '100%' }}
      data={messages}
      firstItemIndex={firstItemIndex}
      startReached={onLoadOlder}
      atTopThreshold={100}
      increaseViewportBy={{ top: 600, bottom: 600 }}
      defaultItemHeight={100}
      computeItemKey={(_index: number, item: Message) => item.id}
      followOutput="smooth"
      components={{
        Header: () =>
          isLoadingMore ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
              加载更早消息中...
            </div>
          ) : hasMoreMessages ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
              向上滚动加载更多
            </div>
          ) : messages.length > 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
              已加载全部消息
            </div>
          ) : null,
        Scroller: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
          function Scroller(scrollerProps, scrollerRef) {
            return <div {...scrollerProps} ref={scrollerRef} className="chat-messages-scroller" />;
          }
        ),
        EmptyPlaceholder: () => (
          <div className="empty-state empty-state-virtuoso">
            <p>开始与 AI 兴趣教练对话吧！</p>
          </div>
        ),
        Footer: () =>
          isLoading ? (
            <div className="message assistant-message">
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          ) : null,
      }}
      itemContent={(_, message) => (
        <div
          className={`message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`}
        >
          <div className="message-content">
            {/* 多Agent模式展示 */}
            {message.role === 'assistant' && message.multiAgentData && (
              <MultiAgentDisplay
                rounds={message.multiAgentData.rounds}
                status={message.multiAgentData.status}
                consensusTrend={message.multiAgentData.consensusTrend}
              />
            )}

            {/* 单Agent模式展示 */}
            {message.role === 'assistant' && !message.multiAgentData && message.thinking && (
              <div className="thinking-content">
                <div className="thinking-label">思考过程：</div>
                <div className="thinking-text">
                  {message.thinking}
                  <div ref={thinkingEndRef} className="thinking-anchor" />
                </div>
              </div>
            )}

            <div className="message-text">
              {message.content ? (
                message.role === 'assistant' ? (
                  <StreamingMarkdown content={message.content} />
                ) : (
                  message.content
                )
              ) : message.role === 'assistant' && !message.thinking && !message.multiAgentData ? (
                '正在思考...'
              ) : null}
            </div>

            {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
              <SourceLinks sources={message.sources} />
            )}

            {/* 失败消息显示重发按钮 */}
            {message.role === 'assistant' && message.failed && (
              <button
                className="retry-btn"
                onClick={() => {
                  const msgIndex = messages.findIndex((m) => m.id === message.id);
                  const prevUserMsg = messages[msgIndex - 1];
                  if (prevUserMsg?.role === 'user') {
                    onRetry(prevUserMsg.id);
                  }
                }}
              >
                🔄 重新发送 ({message.retryCount || 0}/3)
              </button>
            )}

            {/* 排队中的消息显示状态 */}
            {message.role === 'user' &&
              message.pendingSync &&
              queue.some((q) => q.userMessageId === message.id) && (
                <span className="pending-badge">
                  ⏳ 等待发送（队列位置: {queue.findIndex((q) => q.userMessageId === message.id) + 1}）
                </span>
              )}
          </div>
        </div>
      )}
    />
  );
});

MessageList.displayName = 'MessageList';

export default MessageList;

