/**
 * 事件管理器 - 统一管理事件监听器的注册和清理
 * 
 * 解决问题：
 * 1. 防止内存泄漏 - 自动清理所有注册的监听器
 * 2. 代码复用 - 避免重复编写清理逻辑
 * 3. 类型安全 - TypeScript 类型提示
 * 
 * @example
 * ```ts
 * // 在 store 或全局作用域中使用
 * const eventManager = new EventManager();
 * 
 * // 注册监听器
 * eventManager.addEventListener(window, 'resize', handleResize);
 * eventManager.addEventListener(document, 'click', handleClick);
 * 
 * // 清理所有监听器（应用卸载时）
 * eventManager.cleanup();
 * ```
 */

type EventTarget = Window | Document | HTMLElement | MediaQueryList;
type EventHandler = EventListenerOrEventListenerObject | ((event: any) => void);

interface ListenerRecord {
  target: EventTarget;
  type: string;
  handler: EventHandler;
  options?: boolean | AddEventListenerOptions;
}

export class EventManager {
  private listeners: ListenerRecord[] = [];
  private isDestroyed = false;

  /**
   * 添加事件监听器（自动管理清理）
   * 
   * @param target - 事件目标（window、document、element 等）
   * @param type - 事件类型（'click'、'resize'、'change' 等）
   * @param handler - 事件处理函数
   * @param options - 事件选项
   * @returns 移除该监听器的函数
   */
  addEventListener<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    handler: (this: Window, ev: WindowEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): () => void;

  addEventListener<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    handler: (this: Document, ev: DocumentEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): () => void;

  addEventListener<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    handler: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): () => void;

  addEventListener(
    target: MediaQueryList,
    type: 'change',
    handler: (ev: MediaQueryListEvent) => any,
    options?: boolean | AddEventListenerOptions
  ): () => void;

  addEventListener(
    target: EventTarget,
    type: string,
    handler: any,
    options?: boolean | AddEventListenerOptions
  ): () => void {
    if (this.isDestroyed) {
      console.warn('⚠️ EventManager 已销毁，无法添加新监听器');
      return () => {};
    }

    // 记录监听器
    const record: ListenerRecord = { target, type, handler, options };
    this.listeners.push(record);

    // 添加监听器（使用类型断言处理不同的事件目标类型）
    (target as any).addEventListener(type, handler, options);

    console.log(`✅ 已注册事件监听器: ${type} (总计: ${this.listeners.length})`);

    // 返回移除该监听器的函数
    return () => this.removeEventListener(target, type, handler);
  }

  /**
   * 移除指定的事件监听器
   */
  removeEventListener(
    target: EventTarget,
    type: string,
    handler: any
  ): void {
    const index = this.listeners.findIndex(
      (record) =>
        record.target === target &&
        record.type === type &&
        record.handler === handler
    );

    if (index !== -1) {
      const record = this.listeners[index];
      (target as any).removeEventListener(type, handler, record.options);
      this.listeners.splice(index, 1);
      console.log(`🗑️ 已移除事件监听器: ${type} (剩余: ${this.listeners.length})`);
    }
  }

  /**
   * 清理所有事件监听器
   */
  cleanup(): void {
    if (this.isDestroyed) {
      console.warn('⚠️ EventManager 已销毁');
      return;
    }

    console.log(`🧹 开始清理 ${this.listeners.length} 个事件监听器...`);

    for (const record of this.listeners) {
      try {
        (record.target as any).removeEventListener(
          record.type,
          record.handler,
          record.options
        );
      } catch (error) {
        console.error(`❌ 清理监听器失败 (${record.type}):`, error);
      }
    }

    this.listeners = [];
    this.isDestroyed = true;
    console.log('✅ 所有事件监听器已清理');
  }

  /**
   * 获取当前注册的监听器数量
   */
  getListenerCount(): number {
    return this.listeners.length;
  }

  /**
   * 获取所有监听器信息（用于调试）
   */
  getListeners(): ReadonlyArray<Readonly<ListenerRecord>> {
    return this.listeners;
  }

  /**
   * 检查是否已销毁
   */
  isActive(): boolean {
    return !this.isDestroyed;
  }
}

/**
 * 创建一个新的事件管理器实例
 * 
 * @example
 * ```ts
 * const manager = createEventManager();
 * manager.addEventListener(window, 'resize', handleResize);
 * ```
 */
export function createEventManager(): EventManager {
  return new EventManager();
}

/**
 * 全局事件管理器单例（谨慎使用）
 * 建议每个模块创建自己的实例，便于独立管理
 */
export const globalEventManager = new EventManager();

/**
 * 应用退出时清理所有全局监听器
 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    globalEventManager.cleanup();
  });
}

