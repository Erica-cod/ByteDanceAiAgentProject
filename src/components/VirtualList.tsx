/**
 * VirtualList 通用虚拟列表组件
 * 
 * 基于 react-virtualized 封装，支持：
 * - 动态高度自动测量
 * - 高度缓存优化
 * - 响应式容器尺寸
 * - 自定义行渲染
 * - 空状态展示
 * 
 * @example
 * <VirtualList
 *   items={conversations}
 *   renderItem={(item, index) => <ConversationItem conversation={item} />}
 *   estimatedItemHeight={80}
 *   noItemsRenderer={() => <Empty />}
 * />
 */
import React, { useRef, useCallback, useImperativeHandle } from 'react';
import { List, CellMeasurer, CellMeasurerCache, AutoSizer } from 'react-virtualized';
import type { ListRowProps } from 'react-virtualized';
import 'react-virtualized/styles.css';
import './VirtualList.css';

interface VirtualListProps<T> {
  /** 数据列表 */
  items: T[];
  /** 渲染单个项目的函数 */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** 估算的单项高度，用于优化首次渲染 */
  estimatedItemHeight?: number;
  /** 最小项目高度 */
  minItemHeight?: number;
  /** 预渲染的额外行数 */
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

function VirtualListInner<T>(
  props: VirtualListProps<T>,
  ref: React.Ref<VirtualListHandle>
) {
  const {
    items,
    renderItem,
    estimatedItemHeight = 80,
    minItemHeight = 50,
    overscanRowCount = 5,
    noItemsRenderer,
    className = '',
    onScroll,
    getItemKey,
  } = props;

  const listRef = useRef<List>(null);

  // ✅ 高度缓存
  const cacheRef = useRef(
    new CellMeasurerCache({
      defaultHeight: estimatedItemHeight,
      fixedWidth: true,
      minHeight: minItemHeight,
    })
  );

  // ✅ 暴露给父组件的方法
  useImperativeHandle(ref, () => ({
    scrollToRow: (index: number) => {
      listRef.current?.scrollToRow(index);
    },
    scrollToBottom: () => {
      if (listRef.current && items.length > 0) {
        const lastIndex = items.length - 1;
        listRef.current.scrollToRow(lastIndex);
      }
    },
    recomputeRowHeights: () => {
      cacheRef.current.clearAll();
      listRef.current?.recomputeRowHeights();
    },
    clearCache: () => {
      cacheRef.current.clearAll();
    },
  }));

  // ✅ 滚动事件处理
  const handleScroll = useCallback(
    ({ scrollTop, scrollHeight, clientHeight }: any) => {
      onScroll?.({ scrollTop, scrollHeight, clientHeight });
    },
    [onScroll]
  );

  // ✅ 行渲染器
  const rowRenderer = useCallback(
    ({ index, key, parent, style }: ListRowProps) => {
      const item = items[index];
      const itemKey = getItemKey ? getItemKey(item, index) : key;

      return (
        <CellMeasurer
          key={itemKey}
          cache={cacheRef.current}
          parent={parent}
          columnIndex={0}
          rowIndex={index}
        >
          {({ registerChild, measure }) => (
            <div
              ref={registerChild as any}
              style={style}
              onLoad={measure}
            >
              {renderItem(item, index)}
            </div>
          )}
        </CellMeasurer>
      );
    },
    [items, renderItem, getItemKey]
  );

  // ✅ 空状态渲染器
  const defaultNoRowsRenderer = useCallback(() => {
    if (noItemsRenderer) {
      const content = noItemsRenderer();
      return content ? <>{content}</> : <div />;
    }
    return <div />;
  }, [noItemsRenderer]);

  return (
    <div className={`virtual-list-container ${className}`} style={{ height: '100%', width: '100%' }}>
      <AutoSizer>
        {({ height, width }) => (
          <List
            ref={listRef}
            height={height}
            width={width}
            rowCount={items.length}
            rowHeight={cacheRef.current.rowHeight}
            rowRenderer={rowRenderer}
            overscanRowCount={overscanRowCount}
            noRowsRenderer={defaultNoRowsRenderer}
            onScroll={handleScroll}
            estimatedRowSize={estimatedItemHeight}
          />
        )}
      </AutoSizer>
    </div>
  );
}

// ✅ 使用泛型 forwardRef
export const VirtualList = React.forwardRef(VirtualListInner) as <T>(
  props: VirtualListProps<T> & { ref?: React.Ref<VirtualListHandle> }
) => React.ReactElement;

export default VirtualList;

