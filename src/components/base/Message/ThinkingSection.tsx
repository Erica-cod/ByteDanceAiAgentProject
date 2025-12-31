/**
 * ThinkingSection - 思考过程展示组件
 * 
 * 职责：展示AI的思考过程
 * 特点：
 * - 纯展示，带标签
 * - 支持展开/收起
 * - 性能优化：防抖处理，减少布局重计算
 */

import React, { useState, useEffect, useRef } from 'react';
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
  /** 展开/收起时的回调 */
  onToggle?: (expanded: boolean) => void;
}

export const ThinkingSection: React.FC<ThinkingSectionProps> = ({
  content,
  defaultExpanded = false,
  label = '思考过程',
  className = '',
  onToggle,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const contentRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  const updateTimerRef = useRef<NodeJS.Timeout>();
  
  // 监听展开状态变化，通知父组件（带防抖）
  useEffect(() => {
    // 跳过首次渲染
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    
    if (onToggle) {
      // 清除之前的定时器（防抖）
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
      }
      
      // ⚡ 性能优化：使用 requestAnimationFrame 确保在下一帧渲染后执行
      // 展开时需要稍微延迟，等待内容完全渲染
      // 收起时可以立即更新
      const delay = isExpanded ? 100 : 0;
      
      updateTimerRef.current = setTimeout(() => {
        requestAnimationFrame(() => {
          onToggle(isExpanded);
        });
      }, delay);
    }
    
    return () => {
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded]);
  
  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };
  
  return (
    <div className={`thinking-section ${className}`} ref={contentRef}>
      <div 
        className="thinking-section__header"
        onClick={handleToggle}
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

