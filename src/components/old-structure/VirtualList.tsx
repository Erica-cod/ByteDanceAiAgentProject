/**
 * VirtualList 通用虚拟列表组件（已迁移到 react-virtuoso）
 *
 * 旧版本基于 react-virtualized（已停止维护），为了避免依赖风险与维护成本，
 * 这里改为 Virtuoso 实现，保留原有 props/handle 形态，尽量兼容旧代码。
 */
import React, { useImperativeHandle, useRef, useCallback } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import './VirtualList.css';

interface VirtualListProps<T> {
  /** 数据列表 */
  items: T[];
  /** 渲染单个项目的函数 */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** 估算的单项高度（Virtuoso 内部会自动测量，这里保留参数以兼容旧调用） */
  estimatedItemHeight?: number;
  /** 最小项目高度（保留参数以兼容旧调用） */
  minItemHeight?: number;
  /** 预渲染的额外行数（旧版是行数，这里近似为像素 overscan） */
  overscanRowCount?: number;
  /** 空状态渲染器 */
  noItemsRenderer?: () => React.ReactNode;
  /** 额外的容器样式 */
  className?: string;
  /** 滚动事件回调 */
  onScroll?: (params: { scrollTop: number; scrollHeight: number; clientHeight: number }) => void;
  /** 项目唯一键提取函数，默认使用 index */
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
      // Virtuoso 自动测量动态高度，无需手动 recompute；保留接口兼容旧调用
    },
    clearCache: () => {
      // Virtuoso 无显式高度缓存，保留接口兼容旧调用
    },
  }));

  const itemContent = useCallback(
    (index: number, item: T) => {
      // 让 renderItem 能拿到 index（与旧版一致）
      return renderItem(item, index);
    },
    [renderItem]
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
              }
            ),
          }}
          // 近似复刻旧版 onScroll 参数
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

// ✅ 使用泛型 forwardRef
export const VirtualList = React.forwardRef(VirtualListInner) as <T>(
  props: VirtualListProps<T> & { ref?: React.Ref<VirtualListHandle> }
) => React.ReactElement;

export default VirtualList;


