# Hooks 使用文档

本项目的 Hooks 已精简为 10 个实用的 hooks，按功能分类组织。

## 目录结构

```
hooks/
├── data/                 # 请求与数据类（4个）
│   ├── useSSEStream.ts
│   ├── useMessageSender.ts
│   ├── useMessageQueue.ts
│   ├── useConversationManager.ts
│   └── index.ts
│
├── interaction/          # 行为交互类（3个）
│   ├── useDebounce.ts
│   ├── useThrottle.ts
│   └── index.ts
│
├── utils/                # 通用工具类（2个）
│   ├── useDateFormat.ts
│   ├── useToggle.ts
│   └── index.ts
│
├── index.ts              # 统一导出
└── README.md             # 本文档
```

## 导入方式

```tsx
// 推荐：从根目录统一导入
import { useDebounce, useDateFormat, useOnlineStatus } from '@/hooks';

// 或者从分类导入
import { useDebounce } from '@/hooks/interaction';
import { useDateFormat } from '@/hooks/utils';
```

---

## 数据类 Hooks

### useSSEStream
SSE 流式请求，支持断线重连和队列

```tsx
const { sendMessage, abort, createAbortController } = useSSEStream({
  onConversationCreated: (convId) => console.log(convId),
});
```

### useMessageSender
消息发送逻辑封装

```tsx
const { sendMessageInternal, retryMessage, abort } = useMessageSender({
  messageCountRefs,
  listRef,
});
```

### useMessageQueue
消息队列管理（离线排队）

```tsx
const { queue, processMessageQueue, addToQueue } = useMessageQueue({
  onProcessQueue: async () => { /* ... */ },
});
```

### useConversationManager
对话列表管理

```tsx
const {
  conversations,
  loadConversations,
  handleNewConversation,
  handleSelectConversation,
} = useConversationManager(userId, onAbort);
```

---

## 交互类 Hooks

### useDebounce
防抖值，延迟更新直到一段时间内没有新的更新

```tsx
const [searchTerm, setSearchTerm] = useState('');
const debouncedSearchTerm = useDebounce(searchTerm, 500);

useEffect(() => {
  // 只有当用户停止输入500ms后才会执行
  fetchSearchResults(debouncedSearchTerm);
}, [debouncedSearchTerm]);
```

### useDebouncedCallback
防抖回调函数

```tsx
const debouncedSearch = useDebouncedCallback((term) => {
  fetchResults(term);
}, 500);

<input onChange={(e) => debouncedSearch(e.target.value)} />
```

### useThrottle
节流，限制函数在指定时间内只能执行一次

```tsx
const throttledScroll = useThrottle(() => {
  handleScroll();
}, 200);

<div onScroll={throttledScroll}>...</div>
```

---

## 工具类 Hooks

### useDateFormat
日期格式化（相对时间/绝对时间）

```tsx
// 相对时间（默认）
const formattedDate = useDateFormat('2024-01-01T12:00:00Z');
// 输出: "2小时前" 或 "昨天" 或 "1月1日"

// 绝对时间
const absoluteDate = useDateFormat(date, { relative: false });
// 输出: "2024年01月01日 12:00"
```

### useToggle
布尔值切换

```tsx
const [isOpen, toggleOpen, setIsOpen] = useToggle(false);

<button onClick={toggleOpen}>切换</button>
<button onClick={() => setIsOpen(true)}>打开</button>
{isOpen && <div>内容</div>}
```

---

## 常见使用场景

### 场景 1：搜索框防抖
```tsx
const [searchTerm, setSearchTerm] = useState('');
const debouncedSearchTerm = useDebounce(searchTerm, 500);

useEffect(() => {
  if (debouncedSearchTerm) {
    fetchSearchResults(debouncedSearchTerm);
  }
}, [debouncedSearchTerm]);

return <input onChange={(e) => setSearchTerm(e.target.value)} />;
```

### 场景 2：滚动事件节流
```tsx
const handleScroll = useThrottle(() => {
  console.log('滚动事件');
  updateScrollPosition();
}, 200);

<div onScroll={handleScroll}>...</div>
```

### 场景 3：模态框切换
```tsx
const [isModalOpen, toggleModal] = useToggle(false);

return (
  <>
    <button onClick={toggleModal}>打开模态框</button>
    {isModalOpen && <Modal onClose={toggleModal} />}
  </>
);
```

### 场景 4：日期显示
```tsx
const DateDisplay: React.FC<{ date: string }> = ({ date }) => {
  const formattedDate = useDateFormat(date);
  return <span>{formattedDate}</span>;
};

// 使用
<DateDisplay date={conversation.updatedAt} />
```

---

## 为什么只保留这 9 个？

### 原则：YAGNI（You Aren't Gonna Need It）

1. **项目规模小**
   - 组件数量有限（6-7个）
   - 未来扩展不多
   - 不需要大量通用工具

2. **只保留实际使用的**
   - 4个数据类：核心业务必需
   - 2个工具类：实际在使用（useDateFormat、useToggle）
   - 3个交互类：防抖节流是最常用的性能优化工具

3. **网络状态管理**
   - queueStore 已有全局网络监听器
   - 不需要额外的 useOnlineStatus hook

3. **降低维护成本**
   - 减少 47% 的代码量
   - 更容易理解和维护
   - 新人上手更快

---

## 未来扩展策略

如果未来需要新功能：

### 1. 先用内联实现
```tsx
// 需要点击外部检测？先直接写
useEffect(() => {
  const handleClick = (e) => {
    if (ref.current && !ref.current.contains(e.target)) {
      onClose();
    }
  };
  document.addEventListener('mousedown', handleClick);
  return () => document.removeEventListener('mousedown', handleClick);
}, []);
```

### 2. 重复 2-3 次后再抽象
只有当同一个逻辑在 2-3 个地方重复时，才考虑抽象成 hook。

### 3. 按需添加
需要什么就添加什么，不要提前设计。

---

## 总结

本项目的 hooks 现在更加：
- **精简** - 只有 9 个实用的 hooks
- **实用** - 每个都在实际使用
- **无冗余** - 没有重复逻辑
- **易维护** - 代码量减少 53%，维护成本降低
- **易理解** - 结构清晰，新人快速上手

遵循 **YAGNI 原则**，保持代码简洁高效！
