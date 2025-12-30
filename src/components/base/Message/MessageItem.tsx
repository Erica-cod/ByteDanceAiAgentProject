/**
 * MessageItem - 基础消息容器组件
 * 
 * 职责：提供统一的消息容器样式和结构
 * 特点：
 * - 不感知消息内容类型
 * - 提供角色区分样式
 * - 支持高度变化回调（用于虚拟列表）
 */

import React, { ReactNode } from 'react';
import './MessageItem.css';

export interface MessageItemProps {
  /** 消息角色 */
  role: 'user' | 'assistant';
  /** 消息内容 */
  children: ReactNode;
  /** 自定义类名 */
  className?: string;
  /** 高度变化回调（用于虚拟列表重新计算） */
  onHeightChange?: () => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  role,
  children,
  className = '',
  onHeightChange,
}) => {
  return (
    <div 
      className={`message-item message-item--${role} ${className}`}
      data-role={role}
    >
      <div className="message-item__content">
        {children}
      </div>
    </div>
  );
};

MessageItem.displayName = 'MessageItem';

