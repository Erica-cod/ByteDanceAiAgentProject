import { useEffect, useRef } from 'react';

/**
 * 自动调整 textarea 高度的 Hook
 * 
 * 特性：
 * - 初始高度为单行（约 40px）
 * - 随着内容增多自动撑开
 * - 达到最大高度后固定，出现滚动条
 * 
 * @param value - textarea 的值
 * @param minHeight - 最小高度（默认 40px，单行）
 * @param maxHeight - 最大高度（默认 200px，约 10 行）
 */
export function useAutoResizeTextarea(
  value: string,
  minHeight: number = 40,
  maxHeight: number = 200
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // 重置高度为 auto，以便正确计算 scrollHeight
    textarea.style.height = 'auto';

    // 计算实际需要的高度
    const scrollHeight = textarea.scrollHeight;

    // 在 minHeight 和 maxHeight 之间动态调整
    if (scrollHeight <= minHeight) {
      textarea.style.height = `${minHeight}px`;
      textarea.style.overflowY = 'hidden';
    } else if (scrollHeight >= maxHeight) {
      textarea.style.height = `${maxHeight}px`;
      textarea.style.overflowY = 'auto';
    } else {
      textarea.style.height = `${scrollHeight}px`;
      textarea.style.overflowY = 'hidden';
    }
  }, [value, minHeight, maxHeight]);

  return textareaRef;
}

