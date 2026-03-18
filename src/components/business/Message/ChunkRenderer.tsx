/**
 * ChunkRenderer - 分块 Markdown 渲染器
 *
 * 集成 Layer 1（React.memo）、Layer 3（Worker 预处理）、Layer 4（IntersectionObserver）。
 * 每个 chunk 独立渲染和缓存，新 chunk 不会触发旧 chunk 重新解析。
 */

import React, { useRef, useState, useEffect, memo } from 'react';
import StreamingMarkdown from './StreamingMarkdown';
import { useWorkerMarkdownParse } from '../../../hooks/data/useWorkerMarkdownParse';

const LAZY_THRESHOLD = 5;
const OBSERVER_ROOT_MARGIN = '1000px';
const CHARS_PER_LINE = 55;
const LINE_HEIGHT_PX = 24;
const BASE_CHUNK_HEIGHT = 60;

interface ChunkRendererProps {
  chunk: string;
  index: number;
  isFirstChunk: boolean;
  useWorker?: boolean;
}

function estimateChunkHeight(text: string): number {
  const lines = Math.max(1, Math.ceil(text.length / CHARS_PER_LINE));
  return BASE_CHUNK_HEIGHT + lines * LINE_HEIGHT_PX;
}

const ChunkRendererInner: React.FC<ChunkRendererProps> = ({
  chunk,
  index,
  isFirstChunk,
  useWorker = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isNearViewport, setIsNearViewport] = useState(index < LAZY_THRESHOLD);
  const hasRendered = useRef(index < LAZY_THRESHOLD);

  useEffect(() => {
    if (index < LAZY_THRESHOLD) return;
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasRendered.current) {
          hasRendered.current = true;
          setIsNearViewport(true);
        }
      },
      { rootMargin: OBSERVER_ROOT_MARGIN },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [index]);

  const { processedText, shouldRenderAsPlainText, isProcessing } = useWorkerMarkdownParse(
    isNearViewport ? chunk : '',
    isFirstChunk,
  );

  const estimatedHeight = estimateChunkHeight(chunk);

  if (!isNearViewport) {
    return (
      <div
        ref={containerRef}
        className="chunk-renderer chunk-renderer--placeholder"
        style={{ minHeight: estimatedHeight }}
      />
    );
  }

  if (isProcessing || !processedText) {
    return (
      <div ref={containerRef} className="chunk-renderer" style={{ minHeight: estimatedHeight }}>
        {shouldRenderAsPlainText ? (
          <pre className="markdown-plain-text-fallback">{chunk}</pre>
        ) : null}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="chunk-renderer">
      {shouldRenderAsPlainText ? (
        <pre className="markdown-plain-text-fallback">{processedText}</pre>
      ) : (
        <StreamingMarkdown content={processedText} enableFixer={false} />
      )}
    </div>
  );
};

export const ChunkRenderer = memo(ChunkRendererInner, (prev, next) => {
  return prev.chunk === next.chunk && prev.index === next.index && prev.isFirstChunk === next.isFirstChunk;
});

ChunkRenderer.displayName = 'ChunkRenderer';
