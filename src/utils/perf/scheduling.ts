/**
 * 调度相关的轻量性能工具
 */

/**
 * 在空闲时执行任务（降级到 setTimeout）
 */
export function runWhenIdle(
  callback: () => void,
  options?: { timeout?: number },
): number {
  if (typeof window === 'undefined') return 0;

  if ('requestIdleCallback' in window) {
    return (window as any).requestIdleCallback(callback, options);
  }
  return setTimeout(callback, 1) as any;
}

/**
 * 取消空闲任务
 */
export function cancelIdleTask(id: number): void {
  if (typeof window === 'undefined') return;

  if ('cancelIdleCallback' in window) {
    (window as any).cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
}

