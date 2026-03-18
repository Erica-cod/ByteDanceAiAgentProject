/**
 * useProgressiveLoad - 渐进式加载数据 Hook
 *
 * 职责：管理渐进式加载的数据和状态
 * 特点：
 * - 封装API调用逻辑
 * - 管理加载状态
 * - 支持单块和批量加载
 * - 暴露 contentChunks 供分块渲染
 * - 动态 chunkSize 适配不同内容长度
 * - 可独立测试
 */

import { useState, useCallback, useMemo } from 'react';

export interface UseProgressiveLoadOptions {
  messageId: string;
  userId: string;
  initialContent: string;
  totalLength: number;
  chunkSize?: number;
}

export interface UseProgressiveLoadReturn {
  fullContent: string;
  /** 已加载的分块数组，每个元素对应一个 chunk 的原始文本 */
  contentChunks: string[];
  loadedLength: number;
  isLoading: boolean;
  progress: number;
  remainingLength: number;
  remainingChunks: number;
  isFullyLoaded: boolean;
  loadMore: () => Promise<void>;
  loadAll: () => Promise<void>;
  collapse: () => void;
  error: string | null;
}

/**
 * 根据总长度动态决定 chunkSize，控制块数在合理范围内
 */
function getAdaptiveChunkSize(totalLength: number, baseChunkSize: number): number {
  if (totalLength <= 5000) return baseChunkSize;
  if (totalLength <= 50000) return Math.max(baseChunkSize, 5000);
  return Math.max(baseChunkSize, 10000);
}

export function useProgressiveLoad(
  options: UseProgressiveLoadOptions,
): UseProgressiveLoadReturn {
  const {
    messageId,
    userId,
    initialContent,
    totalLength,
    chunkSize: baseChunkSize = 1000,
  } = options;

  const chunkSize = useMemo(
    () => getAdaptiveChunkSize(totalLength, baseChunkSize),
    [totalLength, baseChunkSize],
  );

  const [contentChunks, setContentChunks] = useState<string[]>([initialContent]);
  const [loadedLength, setLoadedLength] = useState(initialContent.length);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fullContent = useMemo(() => contentChunks.join(''), [contentChunks]);
  const isFullyLoaded = loadedLength >= totalLength;
  const progress = Math.round((loadedLength / totalLength) * 100);
  const remainingLength = totalLength - loadedLength;
  const remainingChunks = Math.ceil(remainingLength / chunkSize);

  const fetchContentRange = useCallback(
    async (start: number, length: number): Promise<string> => {
      const response = await fetch(
        `/api/messages/${messageId}/content?` +
        `userId=${userId}&start=${start}&length=${length}`,
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: 加载失败`);
      }

      const data = await response.json();
      return data.content;
    },
    [messageId, userId],
  );

  const loadMore = useCallback(async () => {
    if (isLoading || isFullyLoaded) return;

    setIsLoading(true);
    setError(null);

    try {
      const content = await fetchContentRange(loadedLength, chunkSize);
      setContentChunks(prev => [...prev, content]);
      setLoadedLength(prev => prev + content.length);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载失败';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, isFullyLoaded, loadedLength, chunkSize, fetchContentRange]);

  const loadAll = useCallback(async () => {
    if (isLoading || isFullyLoaded) return;

    setIsLoading(true);
    setError(null);

    try {
      const remaining = totalLength - loadedLength;
      const chunks = Math.ceil(remaining / chunkSize);

      const requests = [];
      for (let i = 0; i < chunks; i++) {
        const start = loadedLength + i * chunkSize;
        const length = Math.min(chunkSize, totalLength - start);
        requests.push(fetchContentRange(start, length));
      }

      const results = await Promise.all(requests);
      setContentChunks(prev => [...prev, ...results]);
      setLoadedLength(totalLength);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载全部失败';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, isFullyLoaded, loadedLength, chunkSize, totalLength, fetchContentRange]);

  const collapse = useCallback(() => {
    setContentChunks([initialContent]);
    setLoadedLength(initialContent.length);
    setError(null);
  }, [initialContent]);

  return {
    fullContent,
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
  };
}
