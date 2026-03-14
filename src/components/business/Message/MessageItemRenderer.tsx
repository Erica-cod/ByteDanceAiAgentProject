/**
 * MessageItemRenderer - 消息渲染器（业务组件）
 * 
 * 职责：根据消息类型和内容选择合适的渲染方式
 * 特点：
 * - 知道业务规则（多Agent、渐进式加载等）
 * - 组合基础组件完成渲染
 * - 处理不同消息类型的路由
 */

import React, { Suspense, useMemo, useState } from 'react';
import { MessageItem, UserMessage, AssistantMessage, ThinkingSection, SourceLinks } from '../../base/Message';
import type { Message } from '../../../stores/chatStore';

const MultiAgentDisplayLazy = React.lazy(() => import('./MultiAgentDisplay'));
const StreamingMarkdownLazy = React.lazy(() => import('./StreamingMarkdown'));
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

interface MultiAgentAssistantContentProps {
  message: Message;
  onHeightChange?: () => void;
}

const MultiAgentAssistantContent: React.FC<MultiAgentAssistantContentProps> = ({ message, onHeightChange }) => {
  const hasStreaming = Boolean(message.streamingAgentContent && Object.keys(message.streamingAgentContent).length > 0);
  const shouldExpandByDefault = hasStreaming || message.multiAgentData?.status === 'in_progress';
  const [expanded, setExpanded] = useState<boolean>(shouldExpandByDefault);

  const summary = useMemo(() => {
    const rounds = message.multiAgentData?.rounds?.length ?? 0;
    const trend = message.multiAgentData?.consensusTrend ?? [];
    const latestConsensus = trend.length > 0 ? trend[trend.length - 1] : null;
    return {
      rounds,
      latestConsensus,
      status: message.multiAgentData?.status ?? 'converged',
    };
  }, [message.multiAgentData]);

  if (expanded) {
    return (
      <Suspense fallback={<div>加载多 Agent 视图中...</div>}>
        <MultiAgentDisplayLazy
          rounds={message.multiAgentData!.rounds}
          status={message.multiAgentData!.status}
          consensusTrend={message.multiAgentData!.consensusTrend}
          streamingAgentContent={message.streamingAgentContent}
          onHeightChange={onHeightChange}
        />
      </Suspense>
    );
  }

  return (
    <div
      className="multi-agent-summary-card"
      style={{
        border: '1px solid #d1d5db',
        borderRadius: '10px',
        padding: '12px 14px',
        background: '#f9fafb',
        color: '#1f2937',
      }}
    >
      <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
        多 Agent 历史摘要
      </div>
      <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.6 }}>
        共 {summary.rounds} 轮讨论，
        状态：{summary.status === 'converged' ? '已收敛' : summary.status === 'in_progress' ? '进行中' : '已终止'}
        {summary.latestConsensus !== null ? `，最终共识 ${(summary.latestConsensus * 100).toFixed(1)}%` : ''}
      </div>
      <button
        style={{
          marginTop: '10px',
          padding: '6px 10px',
          borderRadius: '8px',
          border: '1px solid #94a3b8',
          background: '#ffffff',
          color: '#1e3a8a',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: 600,
        }}
        onClick={() => {
          setExpanded(true);
          onHeightChange?.();
        }}
      >
        查看完整讨论过程
      </button>
    </div>
  );
};

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
          <MultiAgentAssistantContent message={message} onHeightChange={onHeightChange} />
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
      <Suspense fallback={<div>渲染消息中...</div>}>
        <StreamingMarkdownLazy content={message.content} />
      </Suspense>
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

