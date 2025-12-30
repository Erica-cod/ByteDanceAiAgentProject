/**
 * ChatLayout - 基础布局组件
 * 
 * 职责：提供稳定的三段式布局结构
 * 特点：
 * - 纯布局，不包含业务逻辑
 * - 通过插槽接收内容
 * - API稳定，变化频率极低
 * - 可复用于任何聊天场景
 */

import React, { ReactNode } from 'react';
import './ChatLayout.css';

export interface ChatLayoutProps {
  /** 头部区域内容 */
  header: ReactNode;
  /** 主内容区域 */
  content: ReactNode;
  /** 底部区域内容 */
  footer: ReactNode;
  /** 自定义类名 */
  className?: string;
}

export const ChatLayout: React.FC<ChatLayoutProps> = ({
  header,
  content,
  footer,
  className = '',
}) => {
  return (
    <div className={`chat-layout ${className}`}>
      <div className="chat-layout__header">
        {header}
      </div>
      
      <div className="chat-layout__content">
        {content}
      </div>
      
      <div className="chat-layout__footer">
        {footer}
      </div>
    </div>
  );
};

ChatLayout.displayName = 'ChatLayout';

