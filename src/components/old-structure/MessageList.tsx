/**
 * 旧版 MessageList（向后兼容）
 *
 * 背景：
 * - 旧实现基于 react-virtualized（已停止维护）
 * - 当前项目已迁移到 react-virtuoso，新实现位于：
 *   `src/components/business/Message/MessageListRefactored.tsx`
 *
 * 目的：
 * - 保留旧的导入路径与导出（避免影响旧代码/文档）
 * - 内部统一走 Virtuoso 版本，避免双套虚拟列表实现
 */
import React from 'react';
import MessageListRefactored, { type MessageListRefactoredHandle } from '../business/Message/MessageListRefactored';
import type { Message } from '../../stores/chatStore';
import type { QueueItem } from '../../stores/queueStore';

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

const MessageList = React.forwardRef<MessageListHandle, MessageListProps>(function MessageList(props, ref) {
  const innerRef = React.useRef<MessageListRefactoredHandle>(null);

  React.useImperativeHandle(ref, () => ({
    scrollToRow: (index) => innerRef.current?.scrollToRow(index),
    scrollToBottom: () => innerRef.current?.scrollToBottom(),
    recomputeRowHeights: () => innerRef.current?.recomputeRowHeights(),
  }));

  return <MessageListRefactored {...props} ref={innerRef} />;
});

export default MessageList;


