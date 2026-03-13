/**
 * VirtualList 通用虚拟列表组件（已迁移到 react-virtuoso）
 */
import React, { useImperativeHandle, useRef, useCallback } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import './VirtualList.css';

interface VirtualListProps<T> {
  /** 数据列表 */
  items: T[];
  /** 渲染单个项目的函数 */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** 估算的单项高度（保留参数兼容旧调用） */
  estimatedItemHeight?: number;
  /** 最小项目高度（保留参数兼容旧调用） */
  minItemHeight?: number;
  /** 预渲染的额外行数 */
  overscanRowCount?: number;
  /** 空状态渲染器 */
  noItemsRenderer?: () => React.ReactNode;
  /** 额外容器样式 */
  className?: string;
  /** 滚动事件回调 */
  onScroll?: (params: { scrollTop: number; scrollHeight: number; clientHeight: number }) => void;
  /** 项目唯一键提取函数，默认 index */
  getItemKey?: (item: T, index: number) => string | number;
}

export interface VirtualListHandle {
  scrollToRow: (index: number) => void;
  scrollToBottom: () => void;
  recomputeRowHeights: () => void;
  clearCache: () => void;
}

function VirtualListInner<T>(props: VirtualListProps<T>, ref: React.Ref<VirtualListHandle>) {
  const {
    items,
    renderItem,
    overscanRowCount = 5,
    noItemsRenderer,
    className = '',
    onScroll,
    getItemKey,
  } = props;

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(ref, () => ({
    scrollToRow: (index: number) => {
      virtuosoRef.current?.scrollToIndex({ index, align: 'start', behavior: 'auto' });
    },
    scrollToBottom: () => {
      if (items.length > 0) {
        virtuosoRef.current?.scrollToIndex({ index: items.length - 1, align: 'end', behavior: 'auto' });
      }
    },
    recomputeRowHeights: () => {
      // Virtuoso 自动测量动态高度，保留接口兼容旧调用
    },
    clearCache: () => {
      // Virtuoso 无显式高度缓存，保留接口兼容旧调用
    },
  }));

  const itemContent = useCallback(
    (index: number, item: T) => renderItem(item, index),
    [renderItem],
  );

  const Empty = useCallback(() => {
    const content = noItemsRenderer?.();
    return <div className="virtual-list-empty">{content ?? null}</div>;
  }, [noItemsRenderer]);

  const overscanPx = Math.max(200, overscanRowCount * 120);

  return (
    <div className={`virtual-list-container ${className}`} style={{ height: '100%', width: '100%' }}>
      {items.length === 0 ? (
        <Empty />
      ) : (
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: '100%', width: '100%' }}
          data={items}
          overscan={overscanPx}
          itemContent={(index, item) => itemContent(index, item)}
          computeItemKey={(index, item) => (getItemKey ? getItemKey(item, index) : index)}
          components={{
            Scroller: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
              function Scroller(props, forwardedRef) {
                const { className: cn, ...rest } = props;
                return (
                  <div
                    {...rest}
                    ref={(el) => {
                      scrollerRef.current = el;
                      if (typeof forwardedRef === 'function') forwardedRef(el);
                      else if (forwardedRef) (forwardedRef as any).current = el;
                    }}
                    className={['virtual-list-scroller', cn].filter(Boolean).join(' ')}
                  />
                );
              },
            ),
          }}
          onScroll={() => {
            if (!onScroll || !scrollerRef.current) return;
            const el = scrollerRef.current;
            onScroll({
              scrollTop: el.scrollTop,
              scrollHeight: el.scrollHeight,
              clientHeight: el.clientHeight,
            });
          }}
        />
      )}
    </div>
  );
}

export const VirtualList = React.forwardRef(VirtualListInner) as <T>(
  props: VirtualListProps<T> & { ref?: React.Ref<VirtualListHandle> },
) => React.ReactElement;

export default VirtualList;

