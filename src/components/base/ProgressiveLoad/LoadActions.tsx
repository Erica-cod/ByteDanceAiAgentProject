/**
 * LoadActions - 加载操作按钮组件
 * 
 * 职责：提供加载相关操作按钮
 * 特点：
 * - 纯展示和交互
 * - 不包含业务逻辑
 * - 支持禁用状态
 */

import React from 'react';
import './LoadActions.css';

export interface LoadActionsProps {
  /** 是否正在加载 */
  isLoading?: boolean;
  /** 是否已全部加载 */
  isFullyLoaded?: boolean;
  /** 加载下一块回调 */
  onLoadMore?: () => void;
  /** 全部加载回调 */
  onLoadAll?: () => void;
  /** 收起回调 */
  onCollapse?: () => void;
  /** 下一块大小提示 */
  nextChunkSize?: number;
  /** 剩余块数 */
  remainingChunks?: number;
  /** 自定义类名 */
  className?: string;
}

export const LoadActions: React.FC<LoadActionsProps> = ({
  isLoading = false,
  isFullyLoaded = false,
  onLoadMore,
  onLoadAll,
  onCollapse,
  nextChunkSize,
  remainingChunks,
  className = '',
}) => {
  if (isFullyLoaded) {
    return (
      <div className={`load-actions ${className}`}>
        <button 
          className="load-actions__button secondary"
          onClick={onCollapse}
          disabled={isLoading}
        >
          收起
        </button>
      </div>
    );
  }
  
  return (
    <div className={`load-actions ${className}`}>
      <button 
        className="load-actions__button primary"
        onClick={onLoadMore}
        disabled={isLoading}
      >
        加载下一块
        {nextChunkSize && (
          <span className="load-actions__hint">
            +{nextChunkSize.toLocaleString()} 字符
          </span>
        )}
      </button>
      
      <button 
        className="load-actions__button secondary"
        onClick={onLoadAll}
        disabled={isLoading}
      >
        全部展开
        {remainingChunks && (
          <span className="load-actions__hint">
            {remainingChunks} 块
          </span>
        )}
      </button>
    </div>
  );
};

LoadActions.displayName = 'LoadActions';

