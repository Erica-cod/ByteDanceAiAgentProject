# 长消息虚拟列表 CLS 与渲染优化方案

## 一、问题背景

### 现象

虚拟列表中单条消息内容较长（>= 7000 字符）时，用户从底部最新消息向上滚动，旧消息进入视口时 CLS（Cumulative Layout Shift）从 0 飙升到 **0.54**，远超 0.1 的合格线。

如果单条消息达到 **10 万字符**，则面临双重问题：CLS 严重 + 渲染阻塞主线程。

### 现有架构

```
消息列表（虚拟列表层）
  └─ MessageListRefactored → react-virtuoso Virtuoso
      └─ MessageItemRenderer → 根据消息类型路由渲染
          ├─ 短消息 → StreamingMarkdownLazy（完整渲染）
          └─ 长消息（>1000字符）→ ProgressiveMessageRefactoredLazy（分块加载）
              └─ useProgressiveLoad → 按 1000 字符/块网络加载
              └─ StreamingMarkdown → 对 fullContent 整体 Markdown 渲染
```

### 问题根因（CLS）

| 因素 | 影响 |
|------|------|
| **Virtuoso 未设 `defaultItemHeight`** | 初始从底部渲染，上方消息用极小默认高度估算，实际渲染后高度差可达 50 倍 |
| **`overscan={600}` 不足** | 600px 只够预渲染 2-3 条短消息，长消息单条可能 2000px+ |
| **`.message-item` 全局 `messageSlideIn` 动画** | 每个消息挂载时 `translateY(10px)` 造成布局偏移，向上滚动时大量消息同时挂载 |
| **Suspense fallback 无高度** | `<div>渲染消息中...</div>` 约 20px，实际内容可能数千 px |
| **`min-height: 60px` 太小** | 长消息实际高度是 60px 的 50 倍 |

### 问题根因（10 万字符渲染性能）

| 因素 | 影响 |
|------|------|
| **`contentChunks.join('')` 整体渲染** | 所有块拼接后传给 `StreamingMarkdown` 做一次完整 Markdown 解析 |
| **每加载一块触发全量重新解析** | 加载第 N 块时，前 N-1 块的解析全部重做，O(n²) 时间复杂度 |
| **DOM 节点无上限** | 10 万字符渲染后可产生上万 DOM 节点，全部参与布局计算 |
| **`loadAll` 并发 100 个请求** | 10 万字符 ÷ 1000 = 100 个 HTTP 并发，带宽和连接压力大 |
| **无 `content-visibility` / IntersectionObserver** | 不可见内容仍参与布局和绘制 |

---

## 二、方案设计

### 横向对比：考虑过的 8 种方案

#### 被采纳的方案

| 方案 | 参考来源 | 核心思路 | 采纳理由 |
|------|---------|---------|---------|
| **分块渲染 + React.memo** | Discord 消息、Notion block 渲染 | 每个 chunk 独立 `<StreamingMarkdown>`，已渲染块不重新解析 | 唯一把时间复杂度从 O(n²) 降到 O(n) 的方案 |
| **CSS `content-visibility: auto`** | Chrome 团队最佳实践、Notion | 浏览器跳过不可见块的布局和绘制 | 零 JS 开销，3 行 CSS，投入产出比最高 |
| **IntersectionObserver 按需挂载** | Twitter/X 推文线程 | 不在视口的 chunk 只渲染空壳 | 极端场景（10 万+）保险，防止 DOM 过载 |
| **Web Worker Markdown 解析** | GitHub Markdown 预览、Jupyter | Worker 线程做 remark 解析，主线程只渲染结果 | 项目已有 Worker 基建（`textStats.worker.ts`），接入成本低 |
| **动态 chunkSize** | — | 根据 totalLength 自适应块大小 | 一行代码，减少极长消息的网络请求数 |

#### 被放弃的方案

| 方案 | 参考来源 | 放弃原因 |
|------|---------|---------|
| **消息内容级虚拟化** | VS Code 终端、Monaco Editor | Markdown AST 是树不是扁平列表，代码块/表格可能跨越数百行，中间切割会**断裂解析上下文**（没有开头 ` ``` ` 的代码块无法渲染） |
| **Canvas/WebGL 渲染** | xterm.js、Google Sheets | 丧失文本选择、复制粘贴、`Ctrl+F`、链接点击、无障碍访问，聊天场景**不可接受** |
| **iframe 隔离每条消息** | 部分邮件客户端 | 每个 iframe 独立浏览上下文，资源开销大；虚拟列表滚动与 iframe 高度同步困难，反而加剧 CLS |
| **分页浏览（第 1/10 页）** | 部分文档查看器 | 聊天场景用户期望连续滚动，分页**割裂阅读体验**；且不解决单页内容过长的问题 |
| **服务端预渲染 Markdown** | GitHub Issues、Stack Overflow | 不支持流式输出；前端有大量特有逻辑（计划卡片提取、JSON 过滤、容错修复），迁移成本高 |
| **`React.lazy` 按 chunk 代码分割** | — | `React.lazy` 是组件级分割不是数据级的，且 Suspense fallback 本身就是 CLS 的源头 |
| **`requestIdleCallback` 分帧渲染** | — | 用户主动滚动时几乎没有空闲帧，反而增加延迟 |

### 最终分层方案及排序依据

```
投入产出比
  ▲
  │  ② content-visibility       ① 分块渲染 + memo
  │     (CSS, 10min)               (改 2 组件, 解决核心瓶颈)
  │
  │  ⑤ 动态 chunkSize            ③ Worker 解析
  │     (改 1 行)                   (已有基建, 并行加速)
  │
  │                              ④ IntersectionObserver
  │                                 (极端场景保险)
  └──────────────────────────────────────────────► 实现复杂度
```

**排序逻辑**：

- **第 1 层（分块渲染）必须第一**：它是唯一改变**算法复杂度**的方案。没有它，其他方案都是常数级优化。当前每加载一块触发全量 Markdown 重新解析，相当于 1+2+3+…+n = O(n²)。分块渲染后每块独立解析且 memo 缓存，新块只触发 O(chunk_size) 的解析。
- **第 2 层（`content-visibility`）投入最小**：3 行 CSS 让浏览器跳过不可见块的布局/绘制，对上万 DOM 节点的消息效果显著。和分块渲染天然配合——每个 chunk 容器加 `content-visibility: auto` 即可。
- **第 3 层（Worker）提前到第三**：项目已有 `textStats.worker.ts` 和 `useLongTextDetection` 建立的完整模式（序列号去重、debounce、错误降级），创建 `markdownParse.worker.ts` 接入成本低。和分块渲染配合后，每个 chunk 的解析在后台并行完成，主线程零阻塞。
- **第 4 层（IntersectionObserver）是保险杠**：`content-visibility` 已经覆盖大部分场景，但对 10 万+ 字符（可能上万 DOM 节点）的极端情况，IntersectionObserver 可以做到不在视口的 chunk **连 DOM 都不生成**，更彻底。
- **第 5 层（动态 chunkSize）顺手做**：一行代码解决 10 万字符 = 100 个 HTTP 请求的问题。

---

## 三、实现细节

### 3.1 已完成：CLS 修复（分支 `fix/virtual-list-cls-long-message`）

针对 CLS 0.54 的问题，已实施以下修复：

#### 3.1.1 Virtuoso 配置优化（`MessageListRefactored.tsx`）

```tsx
// 变更前
<Virtuoso overscan={600} />

// 变更后
<Virtuoso
  defaultItemHeight={200}
  increaseViewportBy={{ top: 2000, bottom: 800 }}
  scrollSeekConfiguration={{
    enter: (velocity) => Math.abs(velocity) > 1200,
    exit: (velocity) => Math.abs(velocity) < 150,
  }}
/>
```

| 配置项 | 作用 |
|--------|------|
| `defaultItemHeight={200}` | 未渲染消息使用 200px 估算（接近平均值），而非 Virtuoso 默认的极小值 |
| `increaseViewportBy={{ top: 2000, bottom: 800 }}` | 视口上方预渲染 2000px（约 10 条消息），替代原来的 `overscan={600}` |
| `scrollSeekConfiguration` | 快速滚动时用 shimmer 占位符代替真实渲染，避免大量消息同时挂载 |

#### 3.1.2 高度估算器（新增 `messageHeightEstimator.ts`）

根据消息内容长度和类型预估渲染高度，在 Virtuoso 首次渲染前提供合理的 `min-height`：

- 用户消息：`BASE_HEIGHT(88) + ceil(contentLen / 55) * 24`
- 助手消息：基础高度 + thinking 区域 + 内容行数 + 来源链接
- 多 Agent 消息：固定折叠高度

#### 3.1.3 高度缓存（`MessageListRefactored.tsx`）

```tsx
const heightCacheRef = useRef<Map<string, number>>(new Map());

// itemContent 中：
const cachedHeight = heightCacheRef.current.get(message.id);
const minHeight = cachedHeight || estimateMessageHeight(message);

// 渲染后更新缓存
ref={(el) => {
  const measured = el.getBoundingClientRect().height;
  if (measured > 0) heightCacheRef.current.set(message.id, measured);
}}
```

已测量过的消息再次进入视口时直接使用缓存高度，不再跳变。

#### 3.1.4 动画修复（`MessageItem.css`）

```css
/* 变更前：所有消息挂载时都播放动画 */
.message-item { animation: messageSlideIn 0.3s ease-out; }

/* 变更后：仅最后一条（新消息）播放 */
.message-item:last-child { animation: messageSlideIn 0.3s ease-out; }

/* 添加 contain 约束 */
.message-item { contain: layout style; }
```

#### 3.1.5 Suspense fallback 高度估算（`MessageItemRenderer.tsx`）

```tsx
// 变更前
<Suspense fallback={<div>渲染消息中...</div>}>

// 变更后：根据内容长度计算 fallback 高度
const fallbackHeight = Math.max(1, Math.ceil(contentLen / 55)) * 24;
<Suspense fallback={<div style={{ minHeight: fallbackHeight }} />}>
```

### 3.2 待实现：分块渲染 + memo

**改造 `ProgressiveMessageRefactored.tsx`**：

```tsx
// 变更前：整体渲染
<StreamingMarkdown content={fullContent} />

// 变更后：逐块渲染，各块独立 memo
{contentChunks.map((chunk, i) => (
  <MemoizedChunkRenderer key={i} content={chunk} isLast={i === contentChunks.length - 1} />
))}
```

`MemoizedChunkRenderer` 使用 `React.memo` 且只在 `content` 变化时重新渲染。加载新 chunk 时，已有 chunk 的渲染结果完全复用。

**改造 `useProgressiveLoad`**：

- 暴露 `contentChunks: string[]` 而非 `fullContent: string`
- 保留 `fullContent` 用于搜索/复制场景（`useMemo` 惰性拼接）

### 3.3 待实现：content-visibility

每个 chunk 容器添加：

```css
.chunk-container {
  content-visibility: auto;
  contain-intrinsic-size: auto 200px;
}
```

浏览器对不在视口的 chunk 跳过布局和绘制，等同于渲染层面的虚拟化但零 JS 开销。

### 3.4 待实现：Web Worker Markdown 解析

新增 `src/workers/markdownParse.worker.ts`，复用现有 Worker 通信模式：

```
主线程                          Worker 线程
  │                                │
  ├─ postMessage({ id, chunk }) ──►│
  │                                ├─ remark.parse(chunk)
  │                                ├─ rehype.stringify(ast)
  │                                ├─ DOMPurify.sanitize(html)
  │◄── postMessage({ id, html }) ──┤
  │                                │
  └─ dangerouslySetInnerHTML ──► DOM
```

参照 `useLongTextDetection.ts` 的模式：
- 短 chunk（< 2000 字符）主线程同步解析，避免 Worker 通信开销
- 长 chunk 投递到 Worker，序列号去重 + 错误降级

### 3.5 待实现：IntersectionObserver 按需挂载

```tsx
function LazyChunk({ content, estimatedHeight }) {
  const [isVisible, ref] = useInViewport({ rootMargin: '500px' });

  return (
    <div ref={ref} style={{ minHeight: isVisible ? undefined : estimatedHeight }}>
      {isVisible ? <MemoizedChunkRenderer content={content} /> : null}
    </div>
  );
}
```

不在视口（含 500px 缓冲区）的 chunk 不 mount `StreamingMarkdown`，只保留带 `min-height` 的空壳。

### 3.6 待实现：动态 chunkSize

```ts
function getChunkSize(totalLength: number): number {
  if (totalLength <= 5000) return 1000;
  if (totalLength <= 50000) return 5000;
  return 10000;
}
```

| totalLength | chunkSize | 块数 | HTTP 请求数 |
|------------|-----------|------|------------|
| 7,000 | 1,000 | 7 | 7 |
| 50,000 | 5,000 | 10 | 10 |
| 100,000 | 10,000 | 10 | 10 |

---

## 四、效果验证

### 已完成（CLS 修复）

| 指标 | 修复前 | 预期修复后 | 测量方式 |
|------|--------|-----------|---------|
| CLS（7000 字符消息向上滚动） | 0.54 | < 0.1 | Lighthouse / PerformanceObserver |
| 快速滚动闪白 | 明显 | 基本消除 | 肉眼 + 录屏 |

### 待验证（分块渲染 + Worker）

| 指标 | 当前预估 | 优化后预期 | 测量方式 |
|------|---------|-----------|---------|
| 10 万字符加载全部后主线程阻塞 | >2s | <100ms | Performance 面板 Long Task |
| 10 万字符渲染后滚动帧率 | <30fps | >55fps | DevTools FPS meter |
| 10 万字符 DOM 节点数（可见） | 10,000+ | <500 | `document.querySelectorAll('*').length`（IntersectionObserver 生效后） |
| 加载全部 HTTP 请求数 | 100 | ≤10 | Network 面板 |

### 测试用例

1. **CLS 回归**：7000 字符消息，从底部向上滚动，PerformanceObserver 监听 layout-shift
2. **长消息极限**：构造 10 万字符消息（含代码块、表格、嵌套列表），验证加载/渲染/滚动全链路
3. **流式输出**：长消息流式生成过程中，验证 followOutput 和高度跟随是否正常
4. **Worker 降级**：禁用 Worker（`typeof Worker === 'undefined'`），验证主线程同步降级路径
