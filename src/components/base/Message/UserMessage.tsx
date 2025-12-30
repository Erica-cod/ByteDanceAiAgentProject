/**
 * UserMessage - 用户消息组件
 * 
 * 职责：展示用户发送的消息
 * 特点：
 * - 纯展示组件
 * - 不包含业务逻辑
 * - 支持待处理状态提示
 */

import React from 'react';
import './UserMessage.css';

export interface UserMessageProps {
  /** 消息内容 */
  content: string;
  /** 是否待处理（排队中） */
  isPending?: boolean;
  /** 队列位置 */
  queuePosition?: number;
  /** 自定义类名 */
  className?: string;
}

export const UserMessage: React.FC<UserMessageProps> = ({
  content,
  isPending = false,
  queuePosition,
  className = '',
}) => {
  return (
    <div className={`user-message ${className}`}>
      <div className="user-message__content">
        {content}
      </div>
      
      {isPending && (
        <div className="user-message__pending">
          ⏳ 等待发送
          {queuePosition !== undefined && ` (队列位置: ${queuePosition})`}
        </div>
      )}
    </div>
  );
};

UserMessage.displayName = 'UserMessage';

