import { useRef, useCallback } from 'react';

/**
 * 节流回调 Hook
 * 限制函数在指定时间内只能执行一次
 * 
 * @param callback - 需要节流的回调函数
 * @param delay - 节流时间间隔（毫秒）
 * @returns 节流后的回调函数
 * 
 * @example
 * ```tsx
 * const handleScroll = useThrottle(() => {
 *   console.log('滚动事件');
 * }, 200);
 * 
 * <div onScroll={handleScroll}>...</div>
 * ```
 */
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 200
): (...args: Parameters<T>) => void {
  const lastRunRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastRun = now - lastRunRef.current;

      if (timeSinceLastRun >= delay) {
        // 立即执行
        callback(...args);
        lastRunRef.current = now;
      } else {
        // 在延迟结束时执行最后一次
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          callback(...args);
          lastRunRef.current = Date.now();
        }, delay - timeSinceLastRun);
      }
    },
    [callback, delay]
  );
}

