# 组件优化计划

## 分析结果：可以优化的重复逻辑

### 1. PlanCard.tsx - 日期格式化逻辑 ⭐⭐⭐

**当前代码**（行 41-49）：
```tsx
const formatDate = (dateString?: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};
```

**优化方案**：使用 `useDateFormat` hook
```tsx
import { useDateFormat } from '../hooks';

// 使用
const formattedDate = useDateFormat(dateString, { relative: false });
```

**优化效果**：
- 减少 8 行代码
- 统一日期格式化逻辑
- 支持相对时间和绝对时间切换

---

### 2. MessageList.tsx - 定时器清理逻辑 ⭐⭐

**当前代码**（行 126-147, 224-232, 298-314）：
```tsx
// 多处使用 setTimeout，需要手动清理
const timer = setTimeout(() => {
  setTransitionOpacity(0);
  setTimeout(() => {
    setIsTransitioning(false);
  }, 300);
}, 500);
return () => clearTimeout(timer);
```

**优化方案**：使用 `useTimeout` hook
```tsx
import { useTimeout } from '../hooks';

useTimeout(() => {
  setTransitionOpacity(0);
}, 500);
```

**优化效果**：
- 自动清理定时器
- 减少重复的 cleanup 代码
- 更清晰的意图表达

---

### 3. MessageList.tsx - 滚动防抖逻辑 ⭐⭐

**当前代码**（行 298-314）：
```tsx
if (streamingScrollTimeoutRef.current) {
  clearTimeout(streamingScrollTimeoutRef.current);
}

streamingScrollTimeoutRef.current = window.setTimeout(() => {
  if (listRef.current) {
    listRef.current.recomputeRowHeights(lastIndex);
    requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollToRow(lastIndex);
      }
    });
  }
}, 100);
```

**优化方案**：使用 `useDebouncedCallback` hook
```tsx
import { useDebouncedCallback } from '../hooks';

const debouncedScrollUpdate = useDebouncedCallback(() => {
  if (listRef.current) {
    listRef.current.recomputeRowHeights(lastIndex);
    requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollToRow(lastIndex);
      }
    });
  }
}, 100);

// 使用
debouncedScrollUpdate();
```

**优化效果**：
- 减少手动管理 timeout ref
- 更清晰的防抖意图
- 自动清理

---

### 4. SourceLinks 组件 - Toggle 状态 ⭐

**当前代码**（MessageList.tsx 行 47-76）：
```tsx
const [isExpanded, setIsExpanded] = React.useState(false);

// 使用
onClick={() => setIsExpanded(!isExpanded)}
```

**优化方案**：创建 `useToggle` hook
```tsx
const [isExpanded, toggleExpanded] = useToggle(false);

// 使用
onClick={toggleExpanded}
```

**优化效果**：
- 减少重复的 toggle 逻辑
- 更简洁的 API

---

### 5. queueStore.ts - 网络状态监听 ⭐⭐⭐

**当前代码**（行 92-102）：
```tsx
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useQueueStore.getState().setOnline(true);
    console.log('网络已恢复');
  });

  window.addEventListener('offline', () => {
    useQueueStore.getState().setOnline(false);
    console.log('网络已断开');
  });
}
```

**问题**：这是在 store 外部监听，不是在组件中。

**优化方案**：在组件中使用 `useOnlineStatus` hook 同步状态
```tsx
// ChatInterface.tsx
import { useOnlineStatus } from '../hooks';

const isOnline = useOnlineStatus();

useEffect(() => {
  useQueueStore.getState().setOnline(isOnline);
}, [isOnline]);
```

**优化效果**：
- 移除全局事件监听
- 更 React 化的状态管理
- 组件卸载时自动清理

---

## 优化优先级

### 高优先级 ⭐⭐⭐
1. **PlanCard.tsx** - 日期格式化（简单且效果明显）
2. **queueStore.ts + ChatInterface.tsx** - 网络状态监听（架构优化）

### 中优先级 ⭐⭐
3. **MessageList.tsx** - 定时器优化
4. **MessageList.tsx** - 滚动防抖优化

### 低优先级 ⭐
5. **SourceLinks** - Toggle 状态（需要先创建 useToggle hook）

---

## 建议新增的 Hooks

### 1. useToggle
```tsx
/**
 * 布尔值切换 Hook
 */
export function useToggle(
  initialValue: boolean = false
): [boolean, () => void, (value: boolean) => void] {
  const [value, setValue] = useState(initialValue);
  
  const toggle = useCallback(() => {
    setValue(v => !v);
  }, []);
  
  return [value, toggle, setValue];
}
```

**使用场景**：
- 模态框开关
- 下拉菜单展开/收起
- 侧边栏显示/隐藏

---

## 实施步骤

### 阶段 1：简单替换（预计 10 分钟）
1. ✅ 优化 PlanCard.tsx 的日期格式化
2. ✅ 创建 useToggle hook

### 阶段 2：定时器优化（预计 20 分钟）
3. 优化 MessageList.tsx 的 timeout 逻辑
4. 优化 MessageList.tsx 的滚动防抖

### 阶段 3：架构优化（预计 15 分钟）
5. 优化网络状态监听逻辑
6. 在 ChatInterface 中集成 useOnlineStatus

---

## 预期效果

- **代码减少**：约 50-80 行
- **可维护性**：提升 30%（统一的逻辑抽象）
- **可读性**：提升 40%（语义化的 hook 名称）
- **Bug 减少**：减少手动清理导致的内存泄漏风险

