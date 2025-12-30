/**
 * SourceLinks - 来源链接展示组件
 * 
 * 职责：展示信息来源链接
 * 特点：
 * - 纯展示，带图标
 * - 支持展开/收起
 * - 可自定义显示数量
 */

import React, { useState } from 'react';
import './SourceLinks.css';

export interface Source {
  title: string;
  url: string;
}

export interface SourceLinksProps {
  /** 来源列表 */
  sources: Source[];
  /** 初始显示数量 */
  initialShowCount?: number;
  /** 自定义类名 */
  className?: string;
}

export const SourceLinks: React.FC<SourceLinksProps> = ({
  sources,
  initialShowCount = 3,
  className = '',
}) => {
  const [showAll, setShowAll] = useState(false);
  
  if (!sources || sources.length === 0) {
    return null;
  }
  
  const displaySources = showAll ? sources : sources.slice(0, initialShowCount);
  const hasMore = sources.length > initialShowCount;
  
  return (
    <div className={`source-links ${className}`}>
      <div className="source-links__header">
        📎 参考来源 ({sources.length})
      </div>
      
      <div className="source-links__list">
        {displaySources.map((source, index) => (
          <a
            key={index}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="source-links__item"
          >
            <span className="source-links__icon">🔗</span>
            <span className="source-links__title">{source.title}</span>
          </a>
        ))}
      </div>
      
      {hasMore && !showAll && (
        <button
          className="source-links__toggle"
          onClick={() => setShowAll(true)}
        >
          显示更多 ({sources.length - initialShowCount} 个)
        </button>
      )}
      
      {showAll && hasMore && (
        <button
          className="source-links__toggle"
          onClick={() => setShowAll(false)}
        >
          收起
        </button>
      )}
    </div>
  );
};

SourceLinks.displayName = 'SourceLinks';

