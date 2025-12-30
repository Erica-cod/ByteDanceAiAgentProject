/**
 * ThinkingSection - 思考过程展示组件
 * 
 * 职责：展示AI的思考过程
 * 特点：
 * - 纯展示，带标签
 * - 支持展开/收起
 */

import React, { useState } from 'react';
import './ThinkingSection.css';

export interface ThinkingSectionProps {
  /** 思考内容 */
  content: string;
  /** 是否默认展开 */
  defaultExpanded?: boolean;
  /** 自定义标签文本 */
  label?: string;
  /** 自定义类名 */
  className?: string;
}

export const ThinkingSection: React.FC<ThinkingSectionProps> = ({
  content,
  defaultExpanded = false,
  label = '思考过程',
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  return (
    <div className={`thinking-section ${className}`}>
      <div 
        className="thinking-section__header"
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
      >
        <span className="thinking-section__label">{label}：</span>
        <span className="thinking-section__toggle">
          {isExpanded ? '▼' : '▶'}
        </span>
      </div>
      
      {isExpanded && (
        <div className="thinking-section__content">
          {content}
        </div>
      )}
    </div>
  );
};

ThinkingSection.displayName = 'ThinkingSection';

