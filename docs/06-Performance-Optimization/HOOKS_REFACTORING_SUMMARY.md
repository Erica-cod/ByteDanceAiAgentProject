# Hooks 重构总结

## 重构目标

优化前端项目结构，将 hooks 按功能分类组织，提升代码可维护性和复用性。

## 重构内容

### 1. 新的目录结构

```
src/hooks/
├── interaction/          # 行为交互类（防抖、节流、键盘事件等）
│   ├── useDebounce.ts
│   ├── useThrottle.ts
│   ├── useClickOutside.ts
│   ├── useKeyPress.ts
│   └── index.ts
│
├── data/                 # 请求与数据类（API请求、SSE流、数据管理等）
│   ├── useSSEStream.ts
│   ├── useMessageSender.ts
│   ├── useMessageQueue.ts
│   ├── useConversationManager.ts
│   └── index.ts
│
├── storage/              # 状态与缓存类（LocalStorage、SessionStorage等）
│   ├── useLocalStorage.ts
│   ├── useSessionStorage.ts
│   └── index.ts
│
├── system/               # 系统与UI类（网络状态、窗口尺寸、定时器等）
│   ├── useOnlineStatus.ts
│   ├── useDocumentVisibility.ts
│   ├── useWindowSize.ts
│   ├── useInterval.ts
│   └── index.ts
│
├── performance/          # 性能优化类（日期格式化、滚动优化等）
│   ├── useDateFormat.ts
│   ├── useScrollToBottom.ts
│   └── index.ts
│
├── index.ts              # 统一导出
└── README.md             # 使用文档
```

### 2. 新增的通用 Hooks

#### 行为交互类
- **useDebounce**: 防抖值
- **useDebouncedCallback**: 防抖回调函数
- **useThrottle**: 节流回调函数
- **useClickOutside**: 点击外部区域检测
- **useKeyPress**: 键盘按键检测
- **useHotkeys**: 组合键检测

#### 状态与缓存类
- **useLocalStorage**: LocalStorage 封装，支持跨标签页同步
- **useSessionStorage**: SessionStorage 封装

#### 系统与UI类
- **useOnlineStatus**: 网络状态监听
- **useDocumentVisibility**: 页面可见性监听
- **useWindowSize**: 窗口尺寸监听
- **useBreakpoint**: 响应式断点判断
- **useInterval**: setInterval 封装
- **useTimeout**: setTimeout 封装

#### 性能优化类
- **useDateFormat**: 日期格式化（相对时间/绝对时间）
- **useScrollToBottom**: 自动滚动到底部

### 3. 迁移的现有 Hooks

已将以下 hooks 移动到 `data/` 文件夹：
- useSSEStream.ts
- useMessageSender.ts
- useMessageQueue.ts
- useConversationManager.ts

### 4. 更新的引用路径

- `src/components/ChatInterface.tsx`: 更新为从 `../hooks` 统一导入
- `src/components/ConversationList.tsx`: 应用 `useDateFormat` hook 替代内联的日期格式化逻辑
- 所有 data 文件夹内的 hooks: 更新相对路径（`../` -> `../../`）

## 优化效果

### 1. 代码复用性提升

**优化前**：
```tsx
// ConversationList.tsx 中的内联日期格式化
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
  // ... 复杂的格式化逻辑
};
```

**优化后**：
```tsx
// 使用通用 hook
import { useDateFormat } from '../hooks';

const ConversationTime: React.FC<{ updatedAt: string }> = ({ updatedAt }) => {
  const formattedDate = useDateFormat(updatedAt);
  return <span className="conversation-time">{formattedDate}</span>;
};
```

### 2. 项目结构更清晰

- **分类明确**：按功能分类，易于查找和维护
- **职责单一**：每个 hook 只做一件事
- **文档完善**：每个 hook 都有详细的 JSDoc 注释和使用示例

### 3. 开发效率提升

- **统一导入**：从 `@/hooks` 统一导入，无需记忆具体路径
- **类型安全**：充分利用 TypeScript 类型系统
- **开箱即用**：新功能可直接使用现有 hooks，减少重复代码

## 潜在的进一步优化

### 1. 可以应用新 hooks 的地方

#### ChatInterface.tsx
```tsx
// 可以使用 useOnlineStatus 替代 queueStore 的 isOnline
import { useOnlineStatus } from '../hooks';

const isOnline = useOnlineStatus();
// 替代: const isOnline = useQueueStore((s) => s.isOnline);
```

#### MessageList.tsx
```tsx
// 可以使用 useScrollToBottom 简化滚动逻辑
import { useScrollToBottom } from '../hooks';

const { ref, scrollToBottom } = useScrollToBottom(messages.length, {
  behavior: 'smooth',
  offsetFromBottom: 100,
});
```

### 2. 可以抽取的重复逻辑

#### 网络状态监听
当前在 `queueStore.ts` 中监听网络状态，可以改为使用 `useOnlineStatus` hook。

#### 滚动到底部逻辑
`MessageList.tsx` 中有大量滚动相关的逻辑，可以抽取到 `useScrollToBottom` hook 中。

#### 定时器清理
多处使用 `setTimeout` 和 `setInterval`，可以统一使用 `useTimeout` 和 `useInterval` hooks。

### 3. 可以新增的 hooks

#### useRetry
```tsx
/**
 * 重试 Hook
 * 自动重试失败的异步操作
 */
export function useRetry<T>(
  asyncFn: () => Promise<T>,
  options: {
    maxRetries?: number;
    retryDelay?: number;
    onError?: (error: Error) => void;
  }
): {
  execute: () => Promise<T>;
  isRetrying: boolean;
  retryCount: number;
};
```

#### useAsync
```tsx
/**
 * 异步操作 Hook
 * 简化异步操作的状态管理
 */
export function useAsync<T>(
  asyncFn: () => Promise<T>,
  immediate: boolean = true
): {
  data: T | null;
  loading: boolean;
  error: Error | null;
  execute: () => Promise<void>;
};
```

#### usePrevious
```tsx
/**
 * 获取上一次的值
 */
export function usePrevious<T>(value: T): T | undefined;
```

#### useToggle
```tsx
/**
 * 布尔值切换 Hook
 */
export function useToggle(
  initialValue: boolean = false
): [boolean, () => void, (value: boolean) => void];
```

## 使用建议

### 1. 导入方式

推荐从根目录统一导入：
```tsx
import { useDebounce, useLocalStorage, useOnlineStatus } from '@/hooks';
```

而不是：
```tsx
import { useDebounce } from '@/hooks/interaction/useDebounce';
import { useLocalStorage } from '@/hooks/storage/useLocalStorage';
```

### 2. 新增 Hook 的步骤

1. 确定分类（interaction/data/storage/system/performance）
2. 在对应文件夹创建 `useXxx.ts`
3. 编写代码并添加 JSDoc 注释
4. 在同文件夹的 `index.ts` 中导出
5. 在 `hooks/index.ts` 中添加导出
6. 更新 `hooks/README.md` 文档

### 3. 命名规范

- Hook 文件名：`useXxx.ts`
- Hook 函数名：`useXxx`（以 `use` 开头）
- 参数和返回值：使用 TypeScript 明确定义类型

## 迁移指南

如果你的代码中使用了旧的导入路径，请按以下方式更新：

### 旧的导入方式
```tsx
import { useSSEStream } from '../hooks/useSSEStream';
import { useMessageSender } from '../hooks/useMessageSender';
```

### 新的导入方式
```tsx
import { useSSEStream, useMessageSender } from '../hooks';
```

## 总结

本次重构：
- ✅ 创建了 5 个分类文件夹
- ✅ 新增了 15 个通用 hooks
- ✅ 迁移了 4 个现有 hooks
- ✅ 更新了所有引用路径
- ✅ 编写了完整的文档和使用示例

项目的 hooks 现在更加：
- **模块化**：按功能分类，职责清晰
- **可复用**：通用 hooks 可在多个组件中使用
- **易维护**：统一的命名和文档规范
- **类型安全**：充分利用 TypeScript

## 下一步建议

1. 逐步将现有组件中的重复逻辑替换为新的 hooks
2. 根据实际需求新增更多通用 hooks
3. 考虑将部分 hooks 发布为独立的 npm 包供其他项目使用

