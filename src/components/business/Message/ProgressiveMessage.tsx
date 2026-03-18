/**
 * ProgressiveMessage - 渐进式消息展示（重构版）
 *
 * 优化改进：
 * - 分块渲染：每个 chunk 独立 React.memo，新 chunk 不触发旧 chunk 重新解析
 * - content-visibility：CSS 层面跳过不可见 chunk 的布局/绘制
 * - IntersectionObserver：远离视口的 chunk 不挂载 DOM
 * - Worker 预处理：JSON 过滤 + Markdown 容错在后台线程完成
 * - 动态 chunkSize：根据 totalLength 自适应块大小
 */

import React from 'react';
import { useProgressiveLoad } from '@/hooks/data/useProgressiveLoad';
import { ProgressBar, LoadStats, LoadActions } from '@/components/base/ProgressiveLoad';
import { ChunkRenderer } from './ChunkRenderer';
import styles from './ProgressiveMessage.module.css';

export interface ProgressiveMessageProps {
  messageId: string;
  userId: string;
  initialContent: string;
  totalLength: number;
  chunkSize?: number;
}

export const ProgressiveMessage: React.FC<ProgressiveMessageProps> = ({
  messageId,
  userId,
  initialContent,
  totalLength,
  chunkSize = 1000,
}) => {
  const {
    contentChunks,
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
    <div className={styles['progressive-message-refactored']}>
      {/* 分块渲染 */}
      <div className={styles['progressive-message-refactored__content']}>
        {contentChunks.map((chunk, i) => (
          <ChunkRenderer
            key={i}
            chunk={chunk}
            index={i}
            isFirstChunk={i === 0}
          />
        ))}
      </div>

      {error && (
        <div className={styles['progressive-message-refactored__error']}>
          {error}
        </div>
      )}

      {isLoading && (
        <div className={styles['progressive-message-refactored__loading']}>
          <div className={styles['loading-spinner']} />
          <span>加载中...</span>
        </div>
      )}

      {!isFullyLoaded && !isLoading && (
        <div className={styles['progressive-message-refactored__controls']}>
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

      {isFullyLoaded && loadedLength > initialContent.length && (
        <div className={styles['progressive-message-refactored__controls']}>
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

ProgressiveMessage.displayName = 'ProgressiveMessage';
