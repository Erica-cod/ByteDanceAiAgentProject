# 项目结构优化总览

## 优化概述

本次优化主要针对前端 hooks 部分进行了系统性重构，将原本扁平化的 hooks 目录按功能分类组织，大幅提升了代码的可维护性、复用性和开发效率。

## 优化前后对比

### 优化前的结构
```
src/hooks/
├── useSSEStream.ts          (449行)
├── useMessageSender.ts      (105行)
├── useMessageQueue.ts       (80行)
├── useConversationManager.ts (120行)
└── index.ts                 (6行)
```

**问题**：
- ❌ 缺乏通用的交互类 hooks（防抖、节流等）
- ❌ 没有状态缓存类 hooks（LocalStorage 等）
- ❌ 缺少系统监听类 hooks（网络状态、窗口尺寸等）
- ❌ 重复逻辑散落在各个组件中（如日期格式化）
- ❌ 扁平化结构，难以扩展和维护

### 优化后的结构
```
src/hooks/
├── interaction/              # 行为交互类 (5个hooks)
│   ├── useDebounce.ts           # 防抖
│   ├── useThrottle.ts           # 节流
│   ├── useClickOutside.ts       # 点击外部检测
│   ├── useKeyPress.ts           # 键盘事件
│   └── index.ts
│
├── data/                     # 请求与数据类 (4个hooks)
│   ├── useSSEStream.ts          # SSE流式请求
│   ├── useMessageSender.ts      # 消息发送
│   ├── useMessageQueue.ts       # 消息队列
│   ├── useConversationManager.ts # 对话管理
│   └── index.ts
│
├── storage/                  # 状态与缓存类 (2个hooks)
│   ├── useLocalStorage.ts       # LocalStorage封装
│   ├── useSessionStorage.ts     # SessionStorage封装
│   └── index.ts
│
├── system/                   # 系统与UI类 (6个hooks)
│   ├── useOnlineStatus.ts       # 网络状态
│   ├── useDocumentVisibility.ts # 页面可见性
│   ├── useWindowSize.ts         # 窗口尺寸
│   ├── useInterval.ts           # 定时器
│   └── index.ts
│
├── performance/              # 性能优化类 (2个hooks)
│   ├── useDateFormat.ts         # 日期格式化
│   ├── useScrollToBottom.ts     # 滚动优化
│   └── index.ts
│
├── index.ts                  # 统一导出
└── README.md                 # 完整文档
```

**优势**：
- ✅ 按功能分类，职责清晰
- ✅ 新增 15 个通用 hooks
- ✅ 完整的 TypeScript 类型定义
- ✅ 详细的 JSDoc 注释和使用示例
- ✅ 统一的导入导出机制

## 新增的通用 Hooks

### 1. 行为交互类 (interaction)

| Hook | 功能 | 使用场景 |
|------|------|----------|
| useDebounce | 防抖值 | 搜索框输入 |
| useDebouncedCallback | 防抖回调 | API 请求防抖 |
| useThrottle | 节流回调 | 滚动事件、窗口 resize |
| useClickOutside | 点击外部检测 | 下拉菜单、弹窗关闭 |
| useKeyPress | 键盘按键监听 | 快捷键绑定 |
| useHotkeys | 组合键监听 | Ctrl+Enter 发送 |

### 2. 状态与缓存类 (storage)

| Hook | 功能 | 使用场景 |
|------|------|----------|
| useLocalStorage | LocalStorage 封装 | 用户偏好设置、主题 |
| useSessionStorage | SessionStorage 封装 | 临时会话状态 |

**特性**：
- 自动 JSON 序列化/反序列化
- 跨标签页同步（LocalStorage）
- 错误处理和降级
- TypeScript 类型安全

### 3. 系统与UI类 (system)

| Hook | 功能 | 使用场景 |
|------|------|----------|
| useOnlineStatus | 网络状态监听 | 离线提示、队列管理 |
| useDocumentVisibility | 页面可见性 | 页面激活时刷新数据 |
| useWindowSize | 窗口尺寸监听 | 响应式布局 |
| useBreakpoint | 响应式断点 | 移动端/桌面端判断 |
| useInterval | 定时器封装 | 轮询、倒计时 |
| useTimeout | 延迟执行 | 延迟操作 |

### 4. 性能优化类 (performance)

| Hook | 功能 | 使用场景 |
|------|------|----------|
| useDateFormat | 日期格式化 | 相对时间显示（"刚刚"、"5分钟前"） |
| useScrollToBottom | 自动滚动 | 聊天列表、日志查看器 |

## 实际应用示例

### 示例 1：ConversationList 组件优化

**优化前**（内联逻辑，30行）：
```tsx
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

  if (diffInHours < 24) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } else if (diffInHours < 48) {
    return '昨天';
  } else if (diffInHours < 168) {
    return `${Math.floor(diffInHours / 24)}天前`;
  } else {
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }
};

// 使用
<span className="conversation-time">{formatDate(conversation.updatedAt)}</span>
```

**优化后**（使用 hook，3行）：
```tsx
import { useDateFormat } from '../hooks';

const ConversationTime: React.FC<{ updatedAt: string }> = ({ updatedAt }) => {
  const formattedDate = useDateFormat(updatedAt);
  return <span className="conversation-time">{formattedDate}</span>;
};
```

**效果**：
- 代码量减少 90%
- 逻辑可复用
- 性能优化（useMemo）
- 类型安全

### 示例 2：搜索框防抖

```tsx
import { useState, useEffect } from 'react';
import { useDebounce } from '@/hooks';

function SearchBox() {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  useEffect(() => {
    // 只有当用户停止输入500ms后才会执行
    if (debouncedSearchTerm) {
      fetchSearchResults(debouncedSearchTerm);
    }
  }, [debouncedSearchTerm]);

  return (
    <input 
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      placeholder="搜索..."
    />
  );
}
```

### 示例 3：网络状态监听

```tsx
import { useOnlineStatus } from '@/hooks';

function NetworkIndicator() {
  const isOnline = useOnlineStatus();

  return (
    <div className={`network-status ${isOnline ? 'online' : 'offline'}`}>
      {isOnline ? (
        <span>✅ 在线</span>
      ) : (
        <span>⚠️ 离线 - 消息将在网络恢复后发送</span>
      )}
    </div>
  );
}
```

### 示例 4：响应式布局

```tsx
import { useBreakpoint } from '@/hooks';

function ResponsiveLayout() {
  const { isMobile, isTablet, isDesktop } = useBreakpoint();

  return (
    <div className="layout">
      {isMobile && <MobileNavigation />}
      {isTablet && <TabletNavigation />}
      {isDesktop && <DesktopNavigation />}
      
      <main>
        {isMobile ? <MobileContent /> : <DesktopContent />}
      </main>
    </div>
  );
}
```

### 示例 5：LocalStorage 持久化

```tsx
import { useLocalStorage } from '@/hooks';

function ThemeSelector() {
  const [theme, setTheme, removeTheme] = useLocalStorage('app-theme', 'light');

  return (
    <div>
      <button onClick={() => setTheme('light')}>浅色</button>
      <button onClick={() => setTheme('dark')}>深色</button>
      <button onClick={removeTheme}>重置</button>
      
      <p>当前主题: {theme}</p>
    </div>
  );
}
```

## 代码质量提升

### 1. TypeScript 类型安全

所有 hooks 都有完整的类型定义：

```tsx
export function useDebounce<T>(value: T, delay: number = 500): T;

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void, () => void];

export function useBreakpoint(): {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
};
```

### 2. 完整的文档注释

每个 hook 都包含：
- 功能说明
- 参数说明（@param）
- 返回值说明（@returns）
- 使用示例（@example）

```tsx
/**
 * 防抖 Hook
 * 延迟更新值，直到一段时间内没有新的更新
 * 
 * @param value - 需要防抖的值
 * @param delay - 延迟时间（毫秒）
 * @returns 防抖后的值
 * 
 * @example
 * ```tsx
 * const debouncedValue = useDebounce(searchTerm, 500);
 * ```
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  // ...
}
```

### 3. 错误处理和边界情况

所有 hooks 都考虑了边界情况：

```tsx
// useLocalStorage 的错误处理
try {
  localStorage.setItem(key, JSON.stringify(value));
} catch (error) {
  console.error(`保存到 LocalStorage 键 "${key}" 失败:`, error);
  // 降级处理：只更新内存状态
}
```

## 性能优化

### 1. 使用 useMemo 缓存计算结果

```tsx
// useDateFormat
return useMemo(() => {
  // 复杂的日期格式化逻辑
  // 只有当 dateString 变化时才重新计算
}, [dateString, relative, locale]);
```

### 2. 使用 useCallback 缓存函数

```tsx
// useThrottle
return useCallback(
  (...args: Parameters<T>) => {
    // 节流逻辑
  },
  [callback, delay]
);
```

### 3. 自动清理副作用

```tsx
// useInterval
useEffect(() => {
  if (delay === null) return;

  const id = setInterval(() => savedCallback.current(), delay);

  // 组件卸载时自动清理
  return () => clearInterval(id);
}, [delay]);
```

## 统计数据

### 代码量统计

| 分类 | 文件数 | 代码行数 | 平均行数/文件 |
|------|--------|----------|---------------|
| interaction | 5 | ~300 | 60 |
| data | 4 | ~754 | 189 |
| storage | 2 | ~200 | 100 |
| system | 5 | ~250 | 50 |
| performance | 2 | ~150 | 75 |
| **总计** | **18** | **~1654** | **92** |

### 新增功能统计

- ✅ 新增 15 个通用 hooks
- ✅ 迁移 4 个现有 hooks
- ✅ 创建 5 个分类文件夹
- ✅ 编写 1 份完整的 README 文档
- ✅ 更新 2 个组件的引用路径

## 潜在的进一步优化

### 1. 可以应用新 hooks 的地方

#### queueStore.ts
```tsx
// 当前：手动监听网络状态
window.addEventListener('online', () => {
  useQueueStore.getState().setOnline(true);
});

// 优化：使用 useOnlineStatus hook
const isOnline = useOnlineStatus();
```

#### MessageList.tsx
```tsx
// 当前：复杂的滚动逻辑（~100行）
const handleScroll = useCallback(({ scrollTop, scrollHeight, clientHeight }) => {
  // 大量滚动相关逻辑
}, []);

// 优化：使用 useScrollToBottom hook
const { ref, scrollToBottom } = useScrollToBottom(messages.length, {
  behavior: 'smooth',
  offsetFromBottom: 100,
});
```

### 2. 可以新增的 hooks

#### useRetry - 自动重试
```tsx
const { execute, isRetrying, retryCount } = useRetry(
  () => fetchData(),
  { maxRetries: 3, retryDelay: 1000 }
);
```

#### useAsync - 异步状态管理
```tsx
const { data, loading, error, execute } = useAsync(() => fetchData());
```

#### usePrevious - 获取上一次的值
```tsx
const prevCount = usePrevious(count);
console.log(`从 ${prevCount} 变为 ${count}`);
```

#### useToggle - 布尔值切换
```tsx
const [isOpen, toggle, setIsOpen] = useToggle(false);
```

#### useCopyToClipboard - 复制到剪贴板
```tsx
const [copiedText, copy] = useCopyToClipboard();
```

## 开发规范

### 1. 命名规范
- Hook 文件名：`useXxx.ts`（驼峰命名）
- Hook 函数名：`useXxx`（以 `use` 开头）
- 参数和返回值：使用 TypeScript 明确定义

### 2. 文档规范
- 每个 hook 必须有 JSDoc 注释
- 包含功能说明、参数说明、返回值说明
- 提供至少一个使用示例

### 3. 导入规范
推荐从根目录统一导入：
```tsx
import { useDebounce, useLocalStorage } from '@/hooks';
```

## 总结

本次优化：
- 📁 **结构优化**：从扁平化到分类组织
- 🔧 **功能增强**：新增 15 个通用 hooks
- 📝 **文档完善**：详细的注释和使用示例
- 🎯 **类型安全**：完整的 TypeScript 类型定义
- ⚡ **性能优化**：合理使用 useMemo 和 useCallback
- 🔄 **可复用性**：通用 hooks 可在多个组件中使用

项目的前端代码现在更加：
- **模块化**：按功能分类，职责清晰
- **可维护**：统一的命名和文档规范
- **可扩展**：易于添加新的 hooks
- **高质量**：完整的类型定义和错误处理

## 相关文档

- [Hooks 使用文档](../src/hooks/README.md)
- [Hooks 重构详细总结](./HOOKS_REFACTORING_SUMMARY.md)

