/**
 * MessageList 组件 - 使用 react-virtualized 实现虚拟化列表
 * 
 * 技术选型说明：
 * - react-virtualized：使用 List + CellMeasurer 处理动态高度
 * - CellMeasurerCache：缓存每行高度，提升性能
 * - AutoSizer：自动响应容器尺寸变化
 * 
 * 动态高度处理：
 * - CellMeasurer：测量每个消息的实际高度
 * - CellMeasurerCache：缓存已测量的高度，避免重复计算
 * - defaultHeight: 初始估算值，影响首次渲染和滚动条精度
 * 
 * 滚动优化：
 * - overscanRowCount: 预渲染额外的行，减少快速滚动时的白屏
 * - scrollToRow: 手动控制滚动位置
 */
import React, { useRef, useImperativeHandle, useCallback } from 'react';
import { List, CellMeasurer, CellMeasurerCache, AutoSizer, WindowScroller } from 'react-virtualized';
import type { ListRowProps } from 'react-virtualized';
import StreamingMarkdown from './StreamingMarkdown';
import MultiAgentDisplay from './MultiAgentDisplay';
import { ProgressiveMessage } from './ProgressiveMessage';
import type { Message } from '../../stores/chatStore';
import type { QueueItem } from '../../stores/queueStore';
import { useToggle } from '../../hooks';
import { useChatStore } from '../../stores';
import 'react-virtualized/styles.css';
import './ChatInterface.css';

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

export interface MessageListHandle {
  scrollToRow: (index: number) => void;
  scrollToBottom: () => void;
  recomputeRowHeights: () => void;
}

// 来源链接组件
const SourceLinks: React.FC<{ sources: Array<{ title: string; url: string }> }> = ({ sources }) => {
  const [isExpanded, toggleExpanded] = useToggle(false);

  return (
    <div className="source-links-container">
      <button className="source-links-toggle" onClick={toggleExpanded}>
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

const MessageList = React.forwardRef<MessageListHandle, MessageListProps>((props, ref) => {
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
  
  // ✅ 获取userId用于渐进式加载
  const userId = useChatStore((s) => s.userId);
  
  // ✅ CellMeasurerCache：缓存每行的高度（优化 CLS）
  const cacheRef = useRef(
    new CellMeasurerCache({
      defaultHeight: 200,  // ✅ 减小默认高度，更接近实际平均高度，减少 CLS
      fixedWidth: true,
      minHeight: 120,      // ✅ 最小高度与 CSS 一致，减少布局偏移
    })
  );

  // ✅ 首次挂载标记
  const isInitialMountRef = useRef(true);
  
  // ✅ 遮罩状态（切换对话时显示）
  const [isTransitioning, setIsTransitioning] = React.useState(true);
  const [transitionOpacity, setTransitionOpacity] = React.useState(1);
  const hasInitialDataRef = useRef(false);
  
  // ✅ 组件挂载时显示不透明遮罩
  React.useEffect(() => {
    setIsTransitioning(true);
    setTransitionOpacity(1);
    hasInitialDataRef.current = false;
  }, []); // 只在挂载时执行
  
  // ✅ 监听数据加载状态，确保有数据后才隐藏遮罩
  React.useEffect(() => {
    // 如果已经有数据了，标记为已加载
    if (messages.length > 0 && !hasInitialDataRef.current) {
      hasInitialDataRef.current = true;
    }
    
    // ✅ 如果数据为空但不在加载中，也隐藏遮罩（新对话或加载失败）
    if (messages.length === 0 && !isLoading && isTransitioning) {
      const timer = setTimeout(() => {
        setTransitionOpacity(0);
        setTimeout(() => {
          setIsTransitioning(false);
        }, 300);
      }, 500);
      return () => clearTimeout(timer);
    }
    
    // ✅ 超时保护：5秒后强制隐藏遮罩（避免网络问题导致一直显示）
    if (isTransitioning) {
      const timeout = setTimeout(() => {
        console.warn('遮罩超时，强制隐藏');
        setTransitionOpacity(0);
        setTimeout(() => {
          setIsTransitioning(false);
        }, 300);
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [messages.length, isLoading, isTransitioning]);
  
  // ✅ 保存最新的消息数量，避免闭包问题
  const messageCountRef = useRef(messages.length);
  React.useEffect(() => {
    messageCountRef.current = messages.length;
  }, [messages.length]);

  // 暴露给父组件的方法
  useImperativeHandle(ref, () => ({
    scrollToRow: (index: number) => {
      listRef.current?.scrollToRow(index);
    },
    scrollToBottom: () => {
      // ✅ 滚动到最后一行
      if (listRef.current && messages.length > 0) {
        const lastIndex = messages.length - 1;
        requestAnimationFrame(() => {
          if (listRef.current) {
            // 第一次滚动
            listRef.current.scrollToRow(lastIndex);
            
            // 延迟重新计算高度并校准滚动
            setTimeout(() => {
              if (listRef.current) {
                cacheRef.current.clearAll();
                listRef.current.recomputeRowHeights();
                
                // 第二次滚动（校准）
                requestAnimationFrame(() => {
                  if (listRef.current) {
                    listRef.current.scrollToRow(lastIndex);
                  }
                });
              }
            }, 50);
          }
        });
      }
    },
    recomputeRowHeights: () => {
      cacheRef.current.clearAll();
      listRef.current?.recomputeRowHeights();
    },
  }));

  // ✅ 首次渲染完成后滚动到底部
  const handleRowsRendered = React.useCallback(() => {
    if (isInitialMountRef.current && messages.length > 0 && listRef.current) {
      isInitialMountRef.current = false;
      const lastIndex = messages.length - 1;
      
      // ✅ 第一帧：确保遮罩已完全显示（不透明）
      requestAnimationFrame(() => {
        // ✅ 第二帧：执行所有滚动操作
        requestAnimationFrame(() => {
          if (listRef.current) {
            // ✅ 第一次滚动到最后一行
            listRef.current.scrollToRow(lastIndex);
            
            // ✅ 延迟重新计算，让 CellMeasurer 先完成初次测量
            setTimeout(() => {
              if (listRef.current) {
                // 立即重新计算高度
                cacheRef.current.clearAll();
                listRef.current.recomputeRowHeights();
                
                // ✅ 第二次滚动（校准）- 使用 scrollToRow 更精确
                requestAnimationFrame(() => {
                  if (listRef.current) {
                    listRef.current.scrollToRow(lastIndex);
                  }
                });
              }
            }, 100);
            
            // ✅ 确保数据已加载后再隐藏遮罩（短暂延迟后开始淡出）
            setTimeout(() => {
              if (hasInitialDataRef.current) {
                setTransitionOpacity(0);
                // 淡出动画完成后移除遮罩元素
                setTimeout(() => {
                  setIsTransitioning(false);
                }, 300);
              }
            }, 150);
          }
        });
      });
    }
  }, [messages.length]);

  // ✅ 监听滚动，检测是否需要加载更多，并跟踪用户位置
  const handleScroll = useCallback(
    ({ scrollTop, scrollHeight, clientHeight }: { scrollTop: number; scrollHeight: number; clientHeight: number }) => {
      // 加载更多逻辑
      if (scrollTop === 0 && hasMoreMessages && !isLoadingMore) {
        onLoadOlder();
      }
      
      // ✅ 跟踪用户是否在底部（距离底部 100px 以内）
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      isUserNearBottomRef.current = distanceFromBottom < 100;
    },
    [hasMoreMessages, isLoadingMore, onLoadOlder]
  );

  // ✅ 监听消息内容变化，动态重新计算高度并滚动（流式输出时）
  const lastContentLengthRef = useRef(0);
  const lastThinkingLengthRef = useRef(0);
  const lastMessageIdRef = useRef<string>('');
  const streamingScrollTimeoutRef = useRef<number | null>(null);
  const isUserNearBottomRef = useRef(true);
  
  React.useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      
      // 如果最后一条消息是助手回复
      if (lastMessage?.role === 'assistant') {
        const contentLength = lastMessage.content?.length || 0;
        const thinkingLength = lastMessage.thinking?.length || 0;
        const messageId = lastMessage.id;
        
        // ⚡ 检测多agent流式阶段（关键优化：完全禁用流式阶段的高度重新计算）
        const hasStreamingContent = lastMessage.streamingAgentContent && 
          Object.keys(lastMessage.streamingAgentContent).length > 0;
        
        // ✅ 检测到新消息或内容/思考过程变化（⚡ 进一步增加阈值，减少CLS）
        const isNewMessage = messageId !== lastMessageIdRef.current;
        const contentChanged = Math.abs(contentLength - lastContentLengthRef.current) > 1000; // ⚡ 从500增加到1000
        const thinkingChanged = Math.abs(thinkingLength - lastThinkingLengthRef.current) > 1000; // ⚡ 从500增加到1000
        
        if (isNewMessage) {
          lastMessageIdRef.current = messageId;
          lastContentLengthRef.current = contentLength;
          lastThinkingLengthRef.current = thinkingLength;
          isUserNearBottomRef.current = true; // 新消息时重置为底部
        }
        
        // ⚡ 关键优化：多agent流式阶段完全禁用高度重新计算，避免CLS
        if (hasStreamingContent) {
          console.log('⏸️  [MessageList] 多agent流式阶段，暂停高度重新计算');
          return; // 直接返回，不触发任何高度重新计算
        }
        
        // ✅ 只有在用户在底部附近时才自动滚动
        if ((isNewMessage || contentChanged || thinkingChanged) && isUserNearBottomRef.current) {
          if (contentChanged) {
            lastContentLengthRef.current = contentLength;
          }
          if (thinkingChanged) {
            lastThinkingLengthRef.current = thinkingLength;
          }
          
          const lastIndex = messages.length - 1;
          
          // ✅ 只清除最后一条消息的缓存，不影响其他消息
          cacheRef.current.clear(lastIndex, 0);
          
          // ✅ 使用更大的防抖延迟，减少重新计算频率（⚡ 性能优化：减少CLS）
          if (streamingScrollTimeoutRef.current) {
            clearTimeout(streamingScrollTimeoutRef.current);
          }
          
          streamingScrollTimeoutRef.current = window.setTimeout(() => {
            if (listRef.current) {
              console.log('🔄 [MessageList] 触发高度重新计算');
              // ✅ 只重新计算最后一条消息，不触发整个列表重排
              listRef.current.recomputeRowHeights(lastIndex);
              
              // ✅ 使用 scrollToRow 代替 scrollToPosition，更精确且不影响其他行
              requestAnimationFrame(() => {
                if (listRef.current) {
                  listRef.current.scrollToRow(lastIndex);
                }
              });
            }
          }, 800); // ⚡ 从400ms增加到800ms，大幅减少触发频率
        }
      }
    }
  }, [messages]);

  // ✅ 渲染单行
  const rowRenderer = useCallback(
    ({ index, key, parent, style }: ListRowProps) => {
      const message = messages[index];

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
              className={`message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`}
              onLoad={measure}
            >
              <div className="message-content">
                {/* 多Agent模式展示 */}
                {message.role === 'assistant' && message.multiAgentData && (
                  <>
                    {/* 🐛 调试：打印 streamingAgentContent */}
                    {message.streamingAgentContent && Object.keys(message.streamingAgentContent).length > 0 && 
                      console.log(`🎨 [MessageList] 传递 streamingAgentContent 给 MultiAgentDisplay:`, message.streamingAgentContent)}
                    <MultiAgentDisplay
                      rounds={message.multiAgentData.rounds}
                      status={message.multiAgentData.status}
                      consensusTrend={message.multiAgentData.consensusTrend}
                      streamingAgentContent={message.streamingAgentContent}
                      onHeightChange={() => {
                        // ✅ 展开/收起时重新测量高度
                        cacheRef.current.clear(index, 0);
                        measure();
                        listRef.current?.recomputeRowHeights(index);
                      }}
                    />
                  </>
                )}

                {/* 单Agent模式展示 */}
                {message.role === 'assistant' && !message.multiAgentData && message.thinking && (
                  <div className="thinking-content">
                    <div className="thinking-label">思考过程：</div>
                    <div className="thinking-text">{message.thinking}</div>
                  </div>
                )}

                <div className="message-text">
                  {message.content ? (
                    message.role === 'assistant' ? (
                      // ✅ 如果内容长度超过1000字符，使用渐进式加载组件
                      message.contentLength && message.contentLength > 1000 ? (
                        <ProgressiveMessage
                          messageId={message.id}
                          userId={userId}
                          initialContent={message.content}
                          totalLength={message.contentLength}
                          chunkSize={1000}
                        />
                      ) : (
                        <StreamingMarkdown content={message.content} />
                      )
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
        </CellMeasurer>
      );
    },
    [messages, queue, onRetry]
  );

  // ✅ 空状态
  const noRowsRenderer = useCallback(() => {
    return (
      <div className="empty-state">
        <p>开始与 AI 兴趣教练对话吧！</p>
      </div>
    );
  }, []);

  return (
    <div ref={scrollContainerRef} style={{ height: '100%', width: '100%', position: 'relative' }}>
      {/* ✅ 切换对话时的遮罩 */}
      {isTransitioning && (
        <div className="message-list-transitioning" style={{ opacity: transitionOpacity }}>
          <div className="transitioning-spinner">
            <div className="spinner"></div>
            <span>{messages.length > 0 ? '加载中...' : '等待数据...'}</span>
          </div>
        </div>
      )}
      
      {/* 加载更多提示 */}
      {isLoadingMore && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
          加载更早消息中...
        </div>
      )}
      {!isLoadingMore && hasMoreMessages && messages.length > 0 && (
        <div style={{ padding: '10px', textAlign: 'center', color: '#999', fontSize: '12px' }}>
          向上滚动加载更多
        </div>
      )}
      {!hasMoreMessages && messages.length > 0 && (
        <div style={{ padding: '10px', textAlign: 'center', color: '#999', fontSize: '12px' }}>
          已加载全部消息
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
            onRowsRendered={handleRowsRendered}
            scrollToAlignment="end"
            className="chat-messages-list"
            estimatedRowSize={800}
          />
        )}
      </AutoSizer>

      {/* 正在生成提示 */}
      {isLoading && (
        <div className="message assistant-message" style={{ padding: '16px' }}>
          <div className="message-content">
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

MessageList.displayName = 'MessageList';

export default MessageList;
