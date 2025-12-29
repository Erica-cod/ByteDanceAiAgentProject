# Hooks 最终精简方案

## 保留的 Hooks（10个）

### 数据类（4个）- 核心业务
1. ✅ **useSSEStream** - SSE 流式请求
2. ✅ **useMessageSender** - 消息发送
3. ✅ **useMessageQueue** - 消息队列
4. ✅ **useConversationManager** - 对话管理

### 工具类（3个）- 实际使用
5. ✅ **useDateFormat** - 日期格式化
6. ✅ **useToggle** - Toggle 状态
7. ✅ **useOnlineStatus** - 网络状态

### 交互类（3个）- 保留常用工具
8. ✅ **useDebounce** - 防抖值
9. ✅ **useDebouncedCallback** - 防抖回调
10. ✅ **useThrottle** - 节流

---

## 删除的 Hooks（9个）

### 交互类
- ❌ useClickOutside - 没用到
- ❌ useKeyPress - 没用到  
- ❌ useHotkeys - 没用到

### 存储类
- ❌ useLocalStorage - 项目已有 conversationCache
- ❌ useSessionStorage - 没用到

### 系统类
- ❌ useDocumentVisibility - 没用到
- ❌ useWindowSize - 没用到
- ❌ useBreakpoint - 没用到
- ❌ useInterval - 没用到
- ❌ useTimeout - 没用到

### 性能类
- ❌ useScrollToBottom - MessageList 已有自定义逻辑

---

## 精简后的结构

```
src/hooks/
├── data/                      # 业务数据类
│   ├── useSSEStream.ts
│   ├── useMessageSender.ts
│   ├── useMessageQueue.ts
│   ├── useConversationManager.ts
│   └── index.ts
│
├── interaction/               # 交互工具类
│   ├── useDebounce.ts        ✅ 保留
│   ├── useThrottle.ts        ✅ 保留
│   └── index.ts
│
├── utils/                     # 通用工具类
│   ├── useDateFormat.ts
│   ├── useToggle.ts
│   ├── useOnlineStatus.ts
│   └── index.ts
│
├── index.ts                   # 统一导出
└── README.md                  # 简化文档
```

---

## 实施步骤

### 1. 删除文件

```bash
# 删除交互类
rm src/hooks/interaction/useClickOutside.ts
rm src/hooks/interaction/useKeyPress.ts

# 删除整个 storage 文件夹
rm -rf src/hooks/storage/

# 删除系统类
rm src/hooks/system/useDocumentVisibility.ts
rm src/hooks/system/useWindowSize.ts
rm src/hooks/system/useInterval.ts

# 删除性能类
rm src/hooks/performance/useScrollToBottom.ts
```

### 2. 创建 utils 文件夹并移动文件

```bash
# 创建 utils 文件夹
mkdir src/hooks/utils

# 移动文件
mv src/hooks/interaction/useToggle.ts src/hooks/utils/
mv src/hooks/system/useOnlineStatus.ts src/hooks/utils/
mv src/hooks/performance/useDateFormat.ts src/hooks/utils/
```

### 3. 删除空文件夹

```bash
rm -rf src/hooks/system/
rm -rf src/hooks/performance/
```

### 4. 更新 index.ts

```tsx
// src/hooks/interaction/index.ts
export { useDebounce, useDebouncedCallback } from './useDebounce';
export { useThrottle } from './useThrottle';
```

```tsx
// src/hooks/utils/index.ts
export { useDateFormat } from './useDateFormat';
export { useToggle } from './useToggle';
export { useOnlineStatus } from './useOnlineStatus';
```

```tsx
// src/hooks/index.ts
// 数据类
export {
  useSSEStream,
  useMessageSender,
  useMessageQueue,
  useConversationManager,
} from './data';

// 交互类（保留防抖和节流）
export {
  useDebounce,
  useDebouncedCallback,
  useThrottle,
} from './interaction';

// 工具类
export {
  useDateFormat,
  useToggle,
  useOnlineStatus,
} from './utils';
```

### 5. 简化文档

删除未使用 hooks 的说明，只保留核心内容。

---

## 精简效果

| 项目 | 精简前 | 精简后 | 减少 |
|------|--------|--------|------|
| Hooks 数量 | 19个 | 10个 | -47% |
| 文件夹数量 | 5个 | 3个 | -40% |
| 代码行数 | ~1704行 | ~1150行 | -32% |

---

## 保留的原因

### 防抖和节流
- ✅ 最常用的性能优化工具
- ✅ 搜索框、滚动事件等场景必备
- ✅ 实现复杂，值得封装

### 其他保留的 hooks
- 业务必需（4个数据类）
- 实际在用（3个工具类）

---

## 总结

**最终保留 10 个 hooks**：
- 4个数据类（核心业务）
- 3个工具类（实际使用）
- 3个交互类（防抖节流）

**删除 9 个未使用的 hooks**，减少维护负担。

✅ 更加合理，既保留了实用工具，又避免了过度设计！

