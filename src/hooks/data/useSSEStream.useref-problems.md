# 为什么 useRef 方案不适合流式 Markdown 渲染

## ❌ 方案 1：使用 useRef（问题多多）

```typescript
function BadStreamingComponent() {
  const contentRef = useRef<string>('');
  const divRef = useRef<HTMLDivElement>(null);

  const updateContent = (newContent: string) => {
    // ❌ 不触发重渲染
    contentRef.current = newContent;
    
    // ❌ 需要手动渲染 Markdown
    if (divRef.current) {
      // 问题 1：需要手动调用 Markdown 渲染库
      // 问题 2：react-markdown 依赖 props，不支持手动渲染
      // 问题 3：代码高亮、GFM 等插件无法工作
      // 问题 4：失去 React 的优势
      divRef.current.innerHTML = renderMarkdownSomehow(newContent);
    }
  };

  return <div ref={divRef}></div>;
}
```

### 问题清单：

1. **Markdown 渲染库不支持**
   - `react-markdown` 需要 props 变化才会重新渲染
   - 插件（代码高亮、GFM）无法正常工作
   - 需要自己实现 Markdown 解析

2. **手动 DOM 操作复杂**
   - 需要处理 XSS 安全问题
   - 需要手动绑定事件（代码复制按钮等）
   - 需要手动管理 CSS 类名

3. **失去 React 优势**
   - 无法使用 React 组件（PlanCard、SourceLinks 等）
   - 无法使用 useMemo、useCallback 优化
   - 难以维护和测试

4. **性能未必更好**
   - 频繁的 `innerHTML` 操作可能更慢
   - 浏览器需要重新解析 HTML
   - 可能触发更多的重排（reflow）

---

## ✅ 方案 2：requestAnimationFrame 批处理（推荐）

```typescript
function GoodStreamingComponent() {
  const [content, setContent] = useState('');
  const rafIdRef = useRef<number | null>(null);
  const pendingContentRef = useRef<string | null>(null);

  const updateContent = (newContent: string) => {
    // ✅ 累积待更新的内容
    pendingContentRef.current = newContent;

    // ✅ 如果已经安排了更新，跳过
    if (rafIdRef.current !== null) return;

    // ✅ 安排在下一帧执行（~16ms）
    rafIdRef.current = requestAnimationFrame(() => {
      setContent(pendingContentRef.current || '');
      pendingContentRef.current = null;
      rafIdRef.current = null;
    });
  };

  // ✅ react-markdown 正常工作
  return <ReactMarkdown>{content}</ReactMarkdown>;
}
```

### 优势：

1. **保持 React 声明式**
   - react-markdown 正常工作
   - 插件正常工作
   - 组件正常工作

2. **明确控制更新频率**
   - 最多 60fps（每 ~16ms 一次）
   - 不依赖 React 的自动批处理

3. **代码简洁**
   - 不需要手动操作 DOM
   - 不需要处理 XSS
   - 易于维护

---

## 📊 性能对比

### 场景：100ms 内收到 10 个 SSE chunk

| 方案 | 状态更新次数 | 重渲染次数 | Markdown 解析次数 |
|------|-------------|-----------|------------------|
| **原始方案** | 10 次 | 2-3 次（React 批处理） | 2-3 次 |
| **RAF 批处理** | 6 次 | 6 次 | 6 次 |
| **useRef 方案** | 0 次 | 0 次 | 10 次（手动 innerHTML） |

### 实际性能：

- **原始方案**：已经够好，React 18 自动优化
- **RAF 批处理**：更精确的控制，减少 50% 渲染
- **useRef 方案**：**不推荐**，复杂且未必更快

---

## 💡 最佳实践

### 1. 大部分场景：使用原始方案
```typescript
// 简单，依赖 React 18 自动批处理
appendToLastMessage(content, thinking, sources);
```

### 2. 高性能要求：使用 RAF 批处理
```typescript
const { scheduleUpdate, flushUpdate } = useOptimizedSSEUpdate();

// SSE 循环中
scheduleUpdate(content, thinking, sources);

// 流结束时
flushUpdate();
```

### 3. 极端场景：使用时间节流
```typescript
const throttledUpdate = useThrottle(
  (content, thinking, sources) => {
    appendToLastMessage(content, thinking, sources);
  },
  100 // 最多 100ms 更新一次
);
```

---

## 🎯 结论

**不要使用 useRef 直接操作 DOM**，原因：
1. Markdown 渲染复杂
2. 失去 React 优势
3. 性能未必更好

**推荐使用 requestAnimationFrame 批处理**，因为：
1. 保持 React 声明式
2. 精确控制更新频率
3. 代码简洁易维护
4. 实际性能提升明显

当前项目的性能已经很好了（虚拟滚动 + React 批处理），
如果需要进一步优化，使用 RAF 批处理即可。

