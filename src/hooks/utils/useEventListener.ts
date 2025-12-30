import { useEffect, useRef } from 'react';

/**
 * 自动管理事件监听器的 Hook
 * 组件卸载时自动清理，防止内存泄漏
 * 
 * @param target - 事件目标（window、document、ref.current 等）
 * @param type - 事件类型
 * @param handler - 事件处理函数
 * @param options - 事件选项
 * 
 * @example
 * ```tsx
 * // 监听窗口 resize
 * useEventListener(window, 'resize', () => {
 *   console.log('窗口大小改变');
 * });
 * 
 * // 监听 document click
 * useEventListener(document, 'click', handleClick);
 * 
 * // 监听 DOM 元素
 * const ref = useRef<HTMLDivElement>(null);
 * useEventListener(ref.current, 'scroll', handleScroll);
 * 
 * // 监听媒体查询
 * const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
 * useEventListener(mediaQuery, 'change', (e) => {
 *   console.log('系统主题改变:', e.matches);
 * });
 * ```
 */

// 重载签名 - Window 事件
export function useEventListener<K extends keyof WindowEventMap>(
  target: Window | null,
  type: K,
  handler: (event: WindowEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions
): void;

// 重载签名 - Document 事件
export function useEventListener<K extends keyof DocumentEventMap>(
  target: Document | null,
  type: K,
  handler: (event: DocumentEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions
): void;

// 重载签名 - HTMLElement 事件
export function useEventListener<K extends keyof HTMLElementEventMap>(
  target: HTMLElement | null,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions
): void;

// 重载签名 - MediaQueryList 事件
export function useEventListener(
  target: MediaQueryList | null,
  type: 'change',
  handler: (event: Event) => void,
  options?: boolean | AddEventListenerOptions
): void;

// 实现
export function useEventListener(
  target: Window | Document | HTMLElement | MediaQueryList | null,
  type: string,
  handler: (event: Event) => void,
  options?: boolean | AddEventListenerOptions
): void {
  // 使用 ref 保存 handler，避免每次渲染都重新绑定
  const savedHandler = useRef(handler);

  // 更新 ref 中的 handler（保持最新）
  useEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  useEffect(() => {
    // 如果 target 不存在，直接返回
    if (!target) return;

    // 创建事件处理函数（调用最新的 handler）
    const eventListener = (event: Event) => savedHandler.current(event);

    // 添加事件监听器
    target.addEventListener(type, eventListener as EventListener, options);

    console.log(`✅ [useEventListener] 已注册: ${type}`);

    // 清理函数（组件卸载时自动调用）
    return () => {
      target.removeEventListener(type, eventListener as EventListener, options);
      console.log(`🗑️ [useEventListener] 已清理: ${type}`);
    };
  }, [target, type, options]); // handler 不在依赖中，因为使用了 ref
}

/**
 * 监听窗口事件的便捷 Hook
 * 
 * @example
 * ```tsx
 * useWindowEvent('resize', () => console.log('resize'));
 * useWindowEvent('scroll', handleScroll);
 * ```
 */
export function useWindowEvent<K extends keyof WindowEventMap>(
  type: K,
  handler: (event: WindowEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions
): void {
  useEventListener(typeof window !== 'undefined' ? window : null, type, handler, options);
}

/**
 * 监听文档事件的便捷 Hook
 * 
 * @example
 * ```tsx
 * useDocumentEvent('click', handleClick);
 * useDocumentEvent('keydown', handleKeyDown);
 * ```
 */
export function useDocumentEvent<K extends keyof DocumentEventMap>(
  type: K,
  handler: (event: DocumentEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions
): void {
  useEventListener(typeof document !== 'undefined' ? document : null, type, handler, options);
}

/**
 * 监听媒体查询变化的 Hook
 * 
 * @param query - 媒体查询字符串
 * @param handler - 变化处理函数
 * 
 * @example
 * ```tsx
 * useMediaQuery('(prefers-color-scheme: dark)', (matches) => {
 *   console.log('深色模式:', matches);
 * });
 * ```
 */
export function useMediaQuery(
  query: string,
  handler: (matches: boolean) => void
): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(query);
    
    const eventHandler = (e: MediaQueryListEvent) => {
      handler(e.matches);
    };

    // 立即执行一次
    handler(mediaQuery.matches);

    // 添加监听器
    mediaQuery.addEventListener('change', eventHandler);

    console.log(`✅ [useMediaQuery] 已注册: ${query}`);

    // 清理
    return () => {
      mediaQuery.removeEventListener('change', eventHandler);
      console.log(`🗑️ [useMediaQuery] 已清理: ${query}`);
    };
  }, [query, handler]);
}

