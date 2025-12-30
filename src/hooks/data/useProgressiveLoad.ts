/**
 * useProgressiveLoad - 渐进式加载数据 Hook
 * 
 * 职责：管理渐进式加载的数据和状态
 * 特点：
 * - 封装API调用逻辑
 * - 管理加载状态
 * - 支持单块和批量加载
 * - 可独立测试
 */

import { useState, useCallback } from 'react';

export interface UseProgressiveLoadOptions {
  /** 消息ID */
  messageId: string;
  /** 用户ID */
  userId: string;
  /** 初始内容 */
  initialContent: string;
  /** 总长度 */
  totalLength: number;
  /** 分块大小 */
  chunkSize?: number;
}

export interface UseProgressiveLoadReturn {
  /** 完整内容（已加载部分） */
  fullContent: string;
  /** 已加载长度 */
  loadedLength: number;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 加载进度 (0-100) */
  progress: number;
  /** 剩余长度 */
  remainingLength: number;
  /** 剩余块数 */
  remainingChunks: number;
  /** 是否已全部加载 */
  isFullyLoaded: boolean;
  /** 加载下一块 */
  loadMore: () => Promise<void>;
  /** 加载所有剩余 */
  loadAll: () => Promise<void>;
  /** 收起到初始状态 */
  collapse: () => void;
  /** 错误信息 */
  error: string | null;
}

/**
 * 渐进式加载 Hook
 */
export function useProgressiveLoad(
  options: UseProgressiveLoadOptions
): UseProgressiveLoadReturn {
  const {
    messageId,
    userId,
    initialContent,
    totalLength,
    chunkSize = 1000,
  } = options;

  // 状态管理
  const [contentChunks, setContentChunks] = useState<string[]>([initialContent]);
  const [loadedLength, setLoadedLength] = useState(initialContent.length);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 计算派生状态
  const fullContent = contentChunks.join('');
  const isFullyLoaded = loadedLength >= totalLength;
  const progress = Math.round((loadedLength / totalLength) * 100);
  const remainingLength = totalLength - loadedLength;
  const remainingChunks = Math.ceil(remainingLength / chunkSize);

  /**
   * 加载内容片段
   */
  const fetchContentRange = useCallback(
    async (start: number, length: number): Promise<string> => {
      const response = await fetch(
        `/api/messages/${messageId}/content?` +
        `userId=${userId}&start=${start}&length=${length}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: 加载失败`);
      }

      const data = await response.json();
      return data.content;
    },
    [messageId, userId]
  );

  /**
   * 加载下一块
   */
  const loadMore = useCallback(async () => {
    if (isLoading || isFullyLoaded) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const content = await fetchContentRange(loadedLength, chunkSize);
      
      setContentChunks(prev => [...prev, content]);
      setLoadedLength(prev => prev + content.length);
      
      console.log(`✅ [useProgressiveLoad] 加载 ${content.length} 字符`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载失败';
      setError(errorMessage);
      console.error('❌ [useProgressiveLoad] 加载失败:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, isFullyLoaded, loadedLength, chunkSize, fetchContentRange]);

  /**
   * 加载所有剩余内容
   */
  const loadAll = useCallback(async () => {
    if (isLoading || isFullyLoaded) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const remaining = totalLength - loadedLength;
      const chunks = Math.ceil(remaining / chunkSize);
      
      console.log(`🔄 [useProgressiveLoad] 并发加载 ${chunks} 块内容...`);

      // 并发加载所有剩余块
      const requests = [];
      for (let i = 0; i < chunks; i++) {
        const start = loadedLength + i * chunkSize;
        const length = Math.min(chunkSize, totalLength - start);
        requests.push(fetchContentRange(start, length));
      }

      const results = await Promise.all(requests);
      
      setContentChunks(prev => [...prev, ...results]);
      setLoadedLength(totalLength);
      
      console.log(`✅ [useProgressiveLoad] 全部加载完成`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载全部失败';
      setError(errorMessage);
      console.error('❌ [useProgressiveLoad] 加载全部失败:', err);
    } finally {
      setIsLoading(false);
    }
  }, [
    isLoading,
    isFullyLoaded,
    loadedLength,
    chunkSize,
    totalLength,
    fetchContentRange,
  ]);

  /**
   * 收起到初始状态
   */
  const collapse = useCallback(() => {
    setContentChunks([initialContent]);
    setLoadedLength(initialContent.length);
    setError(null);
    console.log(`↩️ [useProgressiveLoad] 收起到初始状态`);
  }, [initialContent]);

  return {
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
  };
}

