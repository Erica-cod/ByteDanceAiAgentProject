import { useEffect, useRef } from 'react';

/**
 * useEventListener - 防闭包陈旧的事件监听 Hook
 *
 * 通过 useRef 持有最新 handler，避免：
 * 1. 闭包捕获旧值导致行为异常
 * 2. handler 变化时频繁拆/装事件监听
 */

export function useEventListener<K extends keyof WindowEventMap>(
  target: Window | null,
  type: K,
  handler: (event: WindowEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions
): void;

export function useEventListener<K extends keyof DocumentEventMap>(
  target: Document | null,
  type: K,
  handler: (event: DocumentEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions
): void;

export function useEventListener<K extends keyof HTMLElementEventMap>(
  target: HTMLElement | null,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions
): void;

export function useEventListener(
  target: MediaQueryList | null,
  type: 'change',
  handler: (event: Event) => void,
  options?: boolean | AddEventListenerOptions
): void;

export function useEventListener(
  target: Window | Document | HTMLElement | MediaQueryList | null,
  type: string,
  handler: (event: Event) => void,
  options?: boolean | AddEventListenerOptions
): void {
  const savedHandler = useRef(handler);

  useEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!target) return;

    const eventListener = (event: Event) => savedHandler.current(event);
    target.addEventListener(type, eventListener as EventListener, options);

    return () => {
      target.removeEventListener(type, eventListener as EventListener, options);
    };
  }, [target, type, options]);
}
