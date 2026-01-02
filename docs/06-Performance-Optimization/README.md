# ⚡ 06-Performance-Optimization（性能优化）

## 📌 模块简介

本文件夹记录了前端性能优化的完整实践，从 Web Vitals 指标优化到内存泄漏修复，从虚拟化列表到 Hooks 优化。性能优化不是一次性工作，而是持续改进的过程。

## 📚 核心文档

### 📊 Web Vitals 优化

#### 1. LCP_OPTIMIZATION_GUIDE.md（15KB）⭐
**LCP (Largest Contentful Paint) 优化指南**

**什么是 LCP？**
- 最大内容绘制时间
- 衡量页面主要内容加载速度
- 目标：< 2.5s

**优化前：** 3.5s  
**优化后：** 1.2s ✅

**优化措施：**
```typescript
// 1. 预加载关键资源
<link rel="preload" href="/critical.css" as="style" />
<link rel="preload" href="/main.js" as="script" />

// 2. 图片优化
<img 
  src="image.webp" 
  loading="lazy"
  decoding="async"
/>

// 3. 代码分割
const ChatPage = lazy(() => import('./pages/Chat'));

// 4. SSR / SSG
export async function getStaticProps() {
  const initialData = await fetchInitialData();
  return { props: { initialData } };
}
```

#### 2. CLS_OPTIMIZATION_GUIDE.md（9KB）
**CLS (Cumulative Layout Shift) 优化指南**

**什么是 CLS？**
- 累积布局偏移
- 衡量视觉稳定性
- 目标：< 0.1

**常见问题：**
- ❌ 未设置图片尺寸
- ❌ 动态注入内容
- ❌ 字体加载导致文本跳动

**优化措施：**
```typescript
// 1. 设置图片尺寸
<img 
  src="image.jpg" 
  width={800} 
  height={600}
  alt="description"
/>

// 2. 预留空间
<div style={{ minHeight: '200px' }}>
  {loading ? <Skeleton /> : <Content />}
</div>

// 3. 字体优化
@font-face {
  font-family: 'Custom';
  src: url('/fonts/custom.woff2') format('woff2');
  font-display: swap; /* 防止文本闪烁 */
}
```

#### 3. FINAL_PERFORMANCE_REPORT.md（12KB）
**最终性能报告**

**优化成果：**
| 指标 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| **LCP** | 3.5s | 1.2s | 65% ↓ |
| **FID** | 150ms | 50ms | 67% ↓ |
| **CLS** | 0.25 | 0.05 | 80% ↓ |
| **TTI** | 5.2s | 2.8s | 46% ↓ |

#### 4. PERFORMANCE_SUMMARY.md（10KB）
**性能优化总结**

### 🧠 内存优化

#### 5. MEMORY_LEAK_FIX.md（10KB）⭐
**内存泄漏修复**

**常见内存泄漏：**
```typescript
// ❌ 问题：未清理的事件监听
useEffect(() => {
  window.addEventListener('resize', handleResize);
  // 忘记清理！
}, []);

// ✅ 解决：正确清理
useEffect(() => {
  window.addEventListener('resize', handleResize);
  return () => {
    window.removeEventListener('resize', handleResize);
  };
}, []);

// ❌ 问题：未关闭的 EventSource
const eventSource = new EventSource(url);
// 组件卸载时忘记关闭！

// ✅ 解决：清理资源
useEffect(() => {
  const eventSource = new EventSource(url);
  return () => {
    eventSource.close();
  };
}, [url]);

// ❌ 问题：闭包引用大对象
const handler = () => {
  const largeData = [...]; // 10MB 数据
  return () => {
    // 这个闭包会一直持有 largeData
    console.log(largeData.length);
  };
};

// ✅ 解决：只保存需要的数据
const handler = () => {
  const largeData = [...];
  const length = largeData.length; // 只保存需要的
  return () => {
    console.log(length);
  };
};
```

**检测方法：**
1. Chrome DevTools Memory Profiler
2. 对比快照查找泄漏对象
3. 使用 useEffect cleanup
4. 避免全局变量累积

#### 6. EVENT_MANAGER_GUIDE.md（12KB）
**事件管理器**

**集中管理事件：**
```typescript
class EventManager {
  private listeners = new Map<string, Set<Function>>();
  
  on(event: string, handler: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }
  
  off(event: string, handler: Function) {
    this.listeners.get(event)?.delete(handler);
  }
  
  emit(event: string, data: any) {
    this.listeners.get(event)?.forEach(handler => {
      handler(data);
    });
  }
  
  cleanup() {
    this.listeners.clear();
  }
}

// 使用
const eventManager = new EventManager();

useEffect(() => {
  const handler = (data) => console.log(data);
  eventManager.on('message', handler);
  
  return () => {
    eventManager.off('message', handler);
  };
}, []);
```

### 🎨 渲染优化

#### 7. VIRTUALIZATION_OPTIMIZATION.md（9KB）
**虚拟化优化**

**React Virtuoso 使用：**
```typescript
import { Virtuoso } from 'react-virtuoso';

<Virtuoso
  data={messages}
  totalCount={messages.length}
  itemContent={(index, message) => (
    <MessageItem key={message.id} message={message} />
  )}
  followOutput="smooth"
  initialTopMostItemIndex={messages.length - 1}
/>
```

**优化效果：**
- ✅ 10,000 条消息无卡顿
- ✅ 内存占用减少 80%
- ✅ 滚动流畅 60fps

#### 8. VIRTUOSO_SCROLL_FIXES.md（11KB）
**Virtuoso 滚动问题修复**

### 🔧 代码优化

#### 9. DEBOUNCE_THROTTLE_ANALYSIS.md（9KB）
**防抖和节流分析**

**使用场景：**
```typescript
// 防抖：等待用户停止输入后再执行
const debouncedSearch = useDebounce((query) => {
  searchAPI(query);
}, 500);

// 节流：固定频率执行
const throttledScroll = useThrottle(() => {
  updateScrollPosition();
}, 100);
```

**自定义 Hooks：**
```typescript
// useDebounce
export const useDebounce = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number
) => {
  const timeoutRef = useRef<NodeJS.Timeout>();
  
  return useCallback((...args: Parameters<T>) => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]);
};

// useThrottle
export const useThrottle = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number
) => {
  const lastRun = useRef(Date.now());
  
  return useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastRun.current >= delay) {
      callback(...args);
      lastRun.current = now;
    }
  }, [callback, delay]);
};
```

#### 10. HOOKS_REFACTORING_SUMMARY.md（8KB）
**Hooks 重构总结**

**优化原则：**
- ✅ 减少不必要的依赖
- ✅ 使用 useMemo 和 useCallback
- ✅ 避免在循环中创建 Hooks
- ✅ 合理拆分复杂 Hooks

#### 11. HOOKS_FINAL_SIMPLIFICATION.md（4KB）
**Hooks 最终简化**

#### 12. COMPONENT_OPTIMIZATION_PLAN.md（5KB）
**组件优化计划**

**React.memo 使用：**
```typescript
// 避免不必要的重渲染
const MessageItem = React.memo(({ message }) => {
  return <div>{message.content}</div>;
}, (prevProps, nextProps) => {
  // 自定义比较逻辑
  return prevProps.message.id === nextProps.message.id &&
         prevProps.message.content === nextProps.message.content;
});
```

### 📈 生产优化

#### 13. PRODUCTION_OPTIMIZATION_GUIDE.md（1KB）
**生产环境优化指南**

#### 14. QUICK_FIX.md（3KB）
**快速修复记录**

## 🎯 关键技术点

### Web Vitals 三大核心指标

```
LCP (Largest Contentful Paint)
- 最大内容绘制
- 目标: < 2.5s
- 优化: 预加载、代码分割、CDN

FID (First Input Delay)
- 首次输入延迟
- 目标: < 100ms
- 优化: 减少 JS 执行时间

CLS (Cumulative Layout Shift)
- 累积布局偏移
- 目标: < 0.1
- 优化: 预留空间、固定尺寸
```

### 性能优化工具

```bash
# Lighthouse 分析
lighthouse https://your-site.com --view

# Bundle 分析
npm run build -- --analyze

# 性能监控
import { getCLS, getFID, getLCP } from 'web-vitals';

getCLS(console.log);
getFID(console.log);
getLCP(console.log);
```

## 💡 面试要点

### 1. 性能优化的思路
1. **测量**：先测量，找出瓶颈
2. **分析**：分析原因
3. **优化**：针对性优化
4. **验证**：验证效果
5. **监控**：持续监控

### 2. 常见性能问题
- **首屏慢**：LCP 过高 → 预加载、SSR
- **交互卡顿**：FID 过高 → 减少 JS 执行
- **布局抖动**：CLS 过高 → 预留空间
- **内存泄漏**：长期运行变慢 → 清理资源

### 3. React 性能优化
- **memo**：避免不必要的重渲染
- **useMemo**：缓存计算结果
- **useCallback**：缓存函数引用
- **lazy**：代码分割、按需加载
- **virtualize**：虚拟化长列表

### 4. 如何发现内存泄漏？
1. Chrome DevTools Memory Profiler
2. 对比堆快照
3. 查找 Detached DOM
4. 检查事件监听器
5. 检查定时器

### 5. 虚拟化列表原理
- 只渲染可见区域的项
- 滚动时动态加载/卸载
- 保持滚动位置正确
- 节省内存和渲染时间

## 🔗 相关模块

- **05-Large-Text-Handling**：大文本渲染优化
- **03-Streaming**：流式传输性能优化

## 📊 实现效果

### 性能提升
- ⚡ LCP: 3.5s → 1.2s (65% ↓)
- ⚡ 内存: 减少 60%
- ⚡ 首屏: 5.2s → 2.8s (46% ↓)

### 用户体验
- ✅ 页面加载更快
- ✅ 交互更流畅
- ✅ 不再卡顿
- ✅ 长时间运行稳定

---

**建议阅读顺序：**
1. `LCP_OPTIMIZATION_GUIDE.md` - Web Vitals优化
2. `MEMORY_LEAK_FIX.md` - 内存问题修复
3. `VIRTUALIZATION_OPTIMIZATION.md` - 列表优化
4. `DEBOUNCE_THROTTLE_ANALYSIS.md` - 工具使用

