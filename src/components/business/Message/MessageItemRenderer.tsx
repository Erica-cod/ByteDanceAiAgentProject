/**
 * MessageItemRenderer - 消息渲染器（业务组件）
 * 
 * 职责：根据消息类型和内容选择合适的渲染方式
 * 特点：
 * - 知道业务规则（多Agent、渐进式加载等）
 * - 组合基础组件完成渲染
 * - 处理不同消息类型的路由
 */

import React, { Suspense } from 'react';
import { MessageItem, UserMessage, AssistantMessage, ThinkingSection, SourceLinks } from '../../base/Message';
import StreamingMarkdown from './StreamingMarkdown';
import type { Message } from '../../../stores/chatStore';

const MultiAgentDisplayLazy = React.lazy(() => import('../../old-structure/MultiAgentDisplay'));
const ProgressiveMessageRefactoredLazy = React.lazy(() =>
  import('./ProgressiveMessageRefactored').then(module => ({ default: module.ProgressiveMessageRefactored }))
);

export interface MessageItemRendererProps {
  /** 消息数据 */
  message: Message;
  /** 用户ID */
  userId: string;
  /** 队列位置（如果在队列中） */
  queuePosition?: number;
  /** 重试回调 */
  onRetry?: (messageId: string) => void;
  /** 高度变化回调 */
  onHeightChange?: () => void;
}

export const MessageItemRenderer: React.FC<MessageItemRendererProps> = ({
  message,
  userId,
  queuePosition,
  onRetry,
  onHeightChange,
}) => {
  // 用户消息
  if (message.role === 'user') {
    return (
      <MessageItem role="user">
        <UserMessage
          content={message.content}
          isPending={message.pendingSync}
          queuePosition={queuePosition}
        />
      </MessageItem>
    );
  }

  // 助手消息
  if (message.role === 'assistant') {
    // 多Agent模式
    if (message.multiAgentData) {
      return (
        <MessageItem role="assistant">
          <Suspense fallback={<div>加载多 Agent 视图中...</div>}>
            <MultiAgentDisplayLazy
              rounds={message.multiAgentData.rounds}
              status={message.multiAgentData.status}
              consensusTrend={message.multiAgentData.consensusTrend}
              streamingAgentContent={message.streamingAgentContent}
              onHeightChange={onHeightChange}
            />
          </Suspense>
        </MessageItem>
      );
    }

    // 单Agent模式
    const thinkingContent = message.thinking ? (
      <ThinkingSection 
        content={message.thinking}
        onToggle={() => {
          // ⚡ 思考框展开时，通知虚拟列表重新计算高度
          if (onHeightChange) {
            onHeightChange();
          }
        }}
      />
    ) : undefined;

    // 内容渲染：渐进式加载 vs 普通渲染
    const contentNode = message.contentLength && message.contentLength > 1000 ? (
      <Suspense fallback={<div>加载大消息渲染器中...</div>}>
        <ProgressiveMessageRefactoredLazy
          messageId={message.id}
          userId={userId}
          initialContent={message.content}
          totalLength={message.contentLength}
          chunkSize={1000}
        />
      </Suspense>
    ) : message.content ? (
      <StreamingMarkdown content={message.content} />
    ) : (
      <div>正在思考...</div>
    );

    // 来源链接
    const sourcesNode = message.sources && message.sources.length > 0 ? (
      <SourceLinks sources={message.sources} />
    ) : undefined;

    // 操作按钮（失败重试）
    const actionsNode = message.failed && onRetry ? (
      <button
        className="retry-btn"
        onClick={() => onRetry(message.id)}
      >
        🔄 重新发送 ({message.retryCount || 0}/3)
      </button>
    ) : undefined;

    return (
      <MessageItem role="assistant">
        <AssistantMessage
          thinking={thinkingContent}
          content={contentNode}
          sources={sourcesNode}
          actions={actionsNode}
        />
      </MessageItem>
    );
  }

  // 未知类型
  return null;
};

MessageItemRenderer.displayName = 'MessageItemRenderer';

