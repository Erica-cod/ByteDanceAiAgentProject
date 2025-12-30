/**
 * AssistantMessage - 助手消息组件
 * 
 * 职责：展示AI助手的回复
 * 特点：
 * - 提供插槽式架构（thinking, content, sources, actions）
 * - 不感知具体的渲染逻辑
 * - 支持各种内容类型组合
 */

import React, { ReactNode } from 'react';
import './AssistantMessage.css';

export interface AssistantMessageProps {
  /** 思考过程（可选） */
  thinking?: ReactNode;
  /** 主要内容 */
  content: ReactNode;
  /** 来源链接（可选） */
  sources?: ReactNode;
  /** 操作按钮（可选） */
  actions?: ReactNode;
  /** 自定义类名 */
  className?: string;
}

export const AssistantMessage: React.FC<AssistantMessageProps> = ({
  thinking,
  content,
  sources,
  actions,
  className = '',
}) => {
  return (
    <div className={`assistant-message ${className}`}>
      {thinking && (
        <div className="assistant-message__thinking">
          {thinking}
        </div>
      )}
      
      <div className="assistant-message__content">
        {content}
      </div>
      
      {sources && (
        <div className="assistant-message__sources">
          {sources}
        </div>
      )}
      
      {actions && (
        <div className="assistant-message__actions">
          {actions}
        </div>
      )}
    </div>
  );
};

AssistantMessage.displayName = 'AssistantMessage';

