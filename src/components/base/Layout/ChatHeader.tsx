/**
 * ChatHeader - 基础头部组件
 * 
 * 职责：提供头部展示区域
 * 特点：
 * - 纯展示，提供标题和控件插槽
 * - 不感知具体的控件内容
 * - 响应式设计
 */

import React, { ReactNode } from 'react';
import './ChatHeader.css';

export interface ChatHeaderProps {
  /** 标题内容 */
  title: ReactNode;
  /** 控件区域（插槽） */
  controls?: ReactNode;
  /** 自定义类名 */
  className?: string;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  title,
  controls,
  className = '',
}) => {
  return (
    <div className={`chat-header ${className}`}>
      <div className="chat-header__title">
        {title}
      </div>
      {controls && (
        <div className="chat-header__controls">
          {controls}
        </div>
      )}
    </div>
  );
};

ChatHeader.displayName = 'ChatHeader';

