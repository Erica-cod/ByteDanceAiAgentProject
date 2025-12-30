# 事件管理器使用指南

## 🎯 问题背景

在 JavaScript/React 应用中，事件监听器如果不正确清理，会导致：

1. **内存泄漏** - 监听器持有对象引用，导致无法被垃圾回收
2. **重复执行** - 组件重新渲染时重复添加监听器
3. **性能下降** - 大量未清理的监听器占用内存
4. **代码冗余** - 每个监听器都要手动编写清理逻辑

## ✨ 解决方案

我们实现了两种优雅的解决方案：

### 1️⃣ **EventManager 类** - 用于全局监听器（stores、工具类）

```typescript
import { createEventManager } from '../utils/eventManager';

// 创建事件管理器实例
const eventManager = createEventManager();

// 注册监听器
eventManager.addEventListener(window, 'resize', handleResize);
eventManager.addEventListener(document, 'click', handleClick);

// 应用退出时清理（可选）
eventManager.cleanup();
```

### 2️⃣ **useEventListener Hook** - 用于 React 组件

```tsx
import { useEventListener } from '../hooks/utils';

function MyComponent() {
  // 自动管理清理，组件卸载时自动移除
  useEventListener(window, 'resize', () => {
    console.log('窗口大小改变');
  });
  
  return <div>...</div>;
}
```

---

## 📚 详细使用指南

### EventManager 类

#### 基本用法

```typescript
import { createEventManager } from '../utils/eventManager';

// 1. 创建管理器实例
const manager = createEventManager();

// 2. 添加监听器
manager.addEventListener(window, 'resize', () => {
  console.log('窗口大小:', window.innerWidth);
});

// 3. 添加更多监听器
manager.addEventListener(document, 'click', (e) => {
  console.log('点击位置:', e.clientX, e.clientY);
});

// 4. 清理所有监听器（应用退出时）
manager.cleanup();
```

#### 在 Zustand Store 中使用

```typescript
// src/stores/themeStore.ts
import { create } from 'zustand';
import { createEventManager } from '../utils/eventManager';

// 创建事件管理器
const themeEventManager = createEventManager();

export const useThemeStore = create((set) => ({
  theme: 'light',
  setTheme: (theme) => set({ theme }),
}));

// 监听系统主题变化
if (typeof window !== 'undefined') {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  
  themeEventManager.addEventListener(mediaQuery, 'change', (e) => {
    const isDark = e.matches;
    useThemeStore.getState().setTheme(isDark ? 'dark' : 'light');
  });
}

// 导出管理器（用于测试或手动清理）
export { themeEventManager };
```

#### 移除单个监听器

```typescript
const manager = createEventManager();

const handleResize = () => console.log('resize');

// 添加监听器（返回移除函数）
const removeListener = manager.addEventListener(window, 'resize', handleResize);

// 稍后移除这个监听器
removeListener();

// 或者直接调用
manager.removeEventListener(window, 'resize', handleResize);
```

#### 调试和监控

```typescript
const manager = createEventManager();

// 获取当前监听器数量
console.log('监听器数量:', manager.getListenerCount());

// 获取所有监听器信息
console.log('监听器列表:', manager.getListeners());

// 检查是否已销毁
console.log('是否活跃:', manager.isActive());
```

---

### useEventListener Hook

#### 基本用法

```tsx
import { useEventListener } from '../hooks/utils';

function MyComponent() {
  // 监听窗口 resize
  useEventListener(window, 'resize', () => {
    console.log('窗口大小改变');
  });
  
  // 监听 document click
  useEventListener(document, 'click', (e) => {
    console.log('点击位置:', e.clientX, e.clientY);
  });
  
  return <div>My Component</div>;
}
```

#### 监听 DOM 元素

```tsx
import { useRef } from 'react';
import { useEventListener } from '../hooks/utils';

function ScrollableComponent() {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // 监听滚动事件
  useEventListener(scrollRef.current, 'scroll', (e) => {
    console.log('滚动位置:', e.target.scrollTop);
  });
  
  return (
    <div ref={scrollRef} style={{ height: 300, overflow: 'auto' }}>
      {/* 内容 */}
    </div>
  );
}
```

#### 便捷 Hooks

```tsx
import { useWindowEvent, useDocumentEvent, useMediaQuery } from '../hooks/utils';

function MyComponent() {
  // 监听窗口事件
  useWindowEvent('resize', () => {
    console.log('窗口大小改变');
  });
  
  // 监听文档事件
  useDocumentEvent('keydown', (e) => {
    if (e.key === 'Escape') {
      console.log('按下 ESC');
    }
  });
  
  // 监听媒体查询
  useMediaQuery('(prefers-color-scheme: dark)', (matches) => {
    console.log('深色模式:', matches);
  });
  
  return <div>My Component</div>;
}
```

#### 动态监听器

```tsx
import { useState } from 'react';
import { useEventListener } from '../hooks/utils';

function ConditionalListener() {
  const [enabled, setEnabled] = useState(false);
  
  // 根据条件动态添加/移除监听器
  useEventListener(
    enabled ? window : null,  // enabled 为 false 时传 null
    'resize',
    () => console.log('resize')
  );
  
  return (
    <button onClick={() => setEnabled(!enabled)}>
      {enabled ? '禁用' : '启用'} 监听器
    </button>
  );
}
```

---

## 🔥 实际应用案例

### 案例 1：主题切换监听系统变化

```typescript
// src/stores/themeStore.ts
import { createEventManager } from '../utils/eventManager';

const themeEventManager = createEventManager();

if (typeof window !== 'undefined') {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  
  themeEventManager.addEventListener(mediaQuery, 'change', () => {
    const store = useThemeStore.getState();
    if (store.theme === 'auto') {
      store.updateEffectiveTheme();
    }
  });
}

export { themeEventManager };
```

### 案例 2：多窗口同步

```typescript
// src/stores/chatStore.ts
import { createEventManager } from '../utils/eventManager';

const chatEventManager = createEventManager();

if (typeof window !== 'undefined') {
  chatEventManager.addEventListener(window, 'storage', (e) => {
    if (e.key?.startsWith('conv_')) {
      // 同步其他标签页的数据
      syncConversationData(e.key, e.newValue);
    }
  });
}

export { chatEventManager };
```

### 案例 3：点击外部关闭弹窗

```tsx
import { useRef, useEffect } from 'react';
import { useDocumentEvent } from '../hooks/utils';

function Modal({ onClose }) {
  const modalRef = useRef<HTMLDivElement>(null);
  
  useDocumentEvent('mousedown', (e) => {
    // 点击外部关闭
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  });
  
  return (
    <div ref={modalRef} className="modal">
      {/* 模态框内容 */}
    </div>
  );
}
```

### 案例 4：键盘快捷键

```tsx
import { useDocumentEvent } from '../hooks/utils';

function App() {
  useDocumentEvent('keydown', (e) => {
    // Ctrl+K 打开搜索
    if (e.ctrlKey && e.key === 'k') {
      e.preventDefault();
      openSearch();
    }
    
    // ESC 关闭弹窗
    if (e.key === 'Escape') {
      closeModal();
    }
  });
  
  return <div>App</div>;
}
```

### 案例 5：网络状态监听

```tsx
import { useState } from 'react';
import { useWindowEvent } from '../hooks/utils';

function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  useWindowEvent('online', () => setIsOnline(true));
  useWindowEvent('offline', () => setIsOnline(false));
  
  return (
    <div>
      网络状态: {isOnline ? '在线' : '离线'}
    </div>
  );
}
```

---

## 🎨 设计模式

### 1. **单例模式** - 全局事件管理器

```typescript
// src/utils/eventManager.ts
export const globalEventManager = new EventManager();

// 应用退出时自动清理
window.addEventListener('beforeunload', () => {
  globalEventManager.cleanup();
});
```

### 2. **工厂模式** - 创建独立实例

```typescript
// 每个模块创建自己的实例
const themeEventManager = createEventManager();
const chatEventManager = createEventManager();
const notificationEventManager = createEventManager();
```

### 3. **装饰器模式** - 增强原生 API

```typescript
// EventManager 装饰了原生的 addEventListener
// 添加了自动清理、批量管理等功能
class EventManager {
  addEventListener(...) {
    // 增强功能
    target.addEventListener(...);  // 调用原生 API
  }
}
```

### 4. **观察者模式** - 事件监听本质

```typescript
// 事件监听器本身就是观察者模式
// EventManager 管理所有观察者（监听器）
eventManager.addEventListener(target, 'change', observer);
```

---

## ⚡ 性能优化

### 1. **使用 useRef 保存 handler**

```tsx
// ❌ 不好：每次渲染都重新绑定
useEventListener(window, 'resize', () => {
  console.log(someState);  // 闭包捕获 someState
});

// ✅ 好：使用 ref 保存最新的 handler
const savedHandler = useRef(handler);
useEffect(() => {
  savedHandler.current = handler;
}, [handler]);
```

### 2. **条件监听**

```tsx
// 只在需要时添加监听器
useEventListener(
  isModalOpen ? document : null,  // 条件判断
  'keydown',
  handleKeyDown
);
```

### 3. **节流和防抖**

```tsx
import { useThrottle } from '../hooks/interaction';

function MyComponent() {
  const throttledHandler = useThrottle(() => {
    console.log('resize');
  }, 200);
  
  useWindowEvent('resize', throttledHandler);
}
```

---

## 🐛 常见问题

### Q1: 为什么要使用 EventManager 而不是直接 addEventListener？

**A:** 主要优势：
1. **自动清理** - 避免忘记 removeEventListener
2. **批量管理** - 一次清理所有监听器
3. **调试方便** - 可以查看所有注册的监听器
4. **类型安全** - TypeScript 类型提示

### Q2: 什么时候用 EventManager，什么时候用 useEventListener？

**A:** 
- **EventManager** - 全局监听器（stores、工具类、应用级别）
- **useEventListener** - 组件内监听器（React 组件）

### Q3: 需要手动调用 cleanup() 吗？

**A:** 
- **useEventListener** - 不需要，组件卸载时自动清理
- **EventManager** - 通常不需要，除非应用完全退出或需要重置

### Q4: 会影响性能吗？

**A:** 几乎没有影响，EventManager 只是在原生 API 上加了一层薄包装。

---

## 📊 内存泄漏对比

### 修复前（内存泄漏）

```typescript
// ❌ 没有清理
window.addEventListener('resize', handleResize);
document.addEventListener('click', handleClick);
mediaQuery.addEventListener('change', handleChange);

// 内存使用: 94.4% ⚠️
```

### 修复后（正确清理）

```typescript
// ✅ 使用 EventManager
const manager = createEventManager();
manager.addEventListener(window, 'resize', handleResize);
manager.addEventListener(document, 'click', handleClick);
manager.addEventListener(mediaQuery, 'change', handleChange);

// 应用退出时自动清理
// 内存使用: 正常 ✅
```

---

## 🎯 总结

### 优势

1. ✅ **防止内存泄漏** - 自动清理监听器
2. ✅ **代码简洁** - 无需手动编写清理逻辑
3. ✅ **类型安全** - 完整的 TypeScript 支持
4. ✅ **易于调试** - 可查看所有监听器
5. ✅ **性能优秀** - 几乎零开销

### 最佳实践

1. **React 组件** → 使用 `useEventListener`
2. **全局监听** → 使用 `EventManager`
3. **独立模块** → 创建独立的 EventManager 实例
4. **高频事件** → 结合节流/防抖使用

### 迁移指南

```typescript
// 旧代码
window.addEventListener('resize', handleResize);
// 需要手动清理
return () => window.removeEventListener('resize', handleResize);

// 新代码
useWindowEvent('resize', handleResize);
// 自动清理 ✨
```

---

## 📚 相关文档

- [React Hooks 最佳实践](./HOOKS_REFACTORING_SUMMARY.md)
- [性能优化指南](./PRODUCTION_OPTIMIZATION_GUIDE.md)
- [内存泄漏排查](./MEMORY_LEAK_FIX.md)

---

**作者**: AI Assistant  
**日期**: 2024-12-29  
**版本**: 1.0.0

