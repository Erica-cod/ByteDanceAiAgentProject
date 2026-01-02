/**
 * ProgressiveMessage - 渐进式消息展示（重构版）
 * 
 * 职责：组合Hook和基础UI组件，提供完整的渐进式消息功能
 * 特点：
 * - 使用useProgressiveLoad管理数据
 * - 使用基础UI组件进行展示
 * - 承载业务规则（消息ID、用户ID等）
 */

import React from 'react';
import { useProgressiveLoad } from '../../../hooks/data/useProgressiveLoad';
import { ProgressBar, LoadStats, LoadActions } from '../../base/ProgressiveLoad';
import StreamingMarkdown from './StreamingMarkdown';
import './ProgressiveMessageRefactored.css';

export interface ProgressiveMessageRefactoredProps {
  /** 消息ID */
  messageId: string;
  /** 用户ID */
  userId: string;
  /** 初始内容（预览） */
  initialContent: string;
  /** 总长度 */
  totalLength: number;
  /** 分块大小 */
  chunkSize?: number;
}

export const ProgressiveMessageRefactored: React.FC<ProgressiveMessageRefactoredProps> = ({
  messageId,
  userId,
  initialContent,
  totalLength,
  chunkSize = 1000,
}) => {
  // 使用Hook管理数据和状态
  const {
    fullContent,
    loadedLength,
    isLoading,
    progress,
    remainingLength,
    remainingChunks,
    isFullyLoaded,
    loadMore,
    loadAll,
    collapse,
    error,
  } = useProgressiveLoad({
    messageId,
    userId,
    initialContent,
    totalLength,
    chunkSize,
  });

  return (
    <div className="progressive-message-refactored">
      {/* 内容展示 */}
      <div className="progressive-message-refactored__content">
        <StreamingMarkdown content={fullContent} />
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="progressive-message-refactored__error">
          ⚠️ {error}
        </div>
      )}

      {/* 加载指示器 */}
      {isLoading && (
        <div className="progressive-message-refactored__loading">
          <div className="loading-spinner"></div>
          <span>加载中...</span>
        </div>
      )}

      {/* 控制区域 */}
      {!isFullyLoaded && !isLoading && (
        <div className="progressive-message-refactored__controls">
          <ProgressBar progress={progress} />
          
          <LoadStats
            loaded={loadedLength}
            total={totalLength}
            unit="字符"
          />
          
          <LoadActions
            isLoading={isLoading}
            isFullyLoaded={isFullyLoaded}
            onLoadMore={loadMore}
            onLoadAll={loadAll}
            nextChunkSize={Math.min(chunkSize, remainingLength)}
            remainingChunks={remainingChunks}
          />
        </div>
      )}

      {/* 已全部加载 */}
      {isFullyLoaded && loadedLength > initialContent.length && (
        <div className="progressive-message-refactored__controls">
          <LoadStats
            loaded={loadedLength}
            total={totalLength}
            unit="字符"
            showSuccessIcon
          />
          
          <LoadActions
            isLoading={isLoading}
            isFullyLoaded={isFullyLoaded}
            onCollapse={collapse}
          />
        </div>
      )}
    </div>
  );
};

ProgressiveMessageRefactored.displayName = 'ProgressiveMessageRefactored';

