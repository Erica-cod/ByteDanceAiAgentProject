# 🛡️ 用户侧行为预测和防范 - 快速参考卡片

> **核心价值：** 在保证高性能和流畅体验的同时，充分保护用户隐私！

---

## ⏱️ 1 分钟极速版

> **第一，虚拟列表**。使用 Virtuoso 只渲染可见区域的 10-15 条消息，支持双向滚动和高度自适应，性能提升 70%，500 条消息从 2 秒降到 0.6 秒。

> **第二，缓存协同**。三层加载策略：LocalStorage 立即显示（0ms 秒开），MongoDB 获取最新数据（200ms），智能合并实现无闪烁更新。

> **第三，数据加密**。使用 AES-GCM 加密加设备绑定，密钥派生自设备指纹，即使 LocalStorage 被窃取也无法解密，10 万次 PBKDF2 迭代防暴力破解。

> **第四，Markdown 容错**。三层兜底机制：自动修复截断的代码块和表格，react-markdown 渲染失败降级到备用渲染器，永不白屏。

> **第五，渐进式传输**。根据数据量自动选择策略：小于 10KB 直接传输，10KB-5MB 压缩传输（gzip 压缩率 70%），大于 5MB 分片传输（50KB 每片，支持断点续传）。

> **第六，渐进式渲染**。后端流式返回超大 Markdown（如一万行代码）时，前端分批渲染：初始只显示 1000 字符，用户点击"加载更多"按钮按需加载，避免一次性渲染卡顿，性能提升 80%。

---

## 📋 核心技术要点

### 1️⃣ 虚拟列表（Virtuoso）

```typescript
<Virtuoso
  data={messages}
  firstItemIndex={firstItemIndex}  // 支持向上加载
  startReached={loadOlderMessages}  // 滚动到顶部触发
  itemContent={(index, message) => <MessageItem message={message} />}
/>
```

**核心机制：**
- ✅ **只渲染可见区域**：500 条 → 只渲染 10-15 条
- ✅ **firstItemIndex 妙用**：向上加载时保持滚动位置
- ✅ **高度自适应**：自动测量每条消息高度
- ✅ **性能提升**：渲染时间 2 秒 → 0.6 秒（70%）

**firstItemIndex 原理：**
```
初始：[msg1, msg2, msg3]  firstItemIndex: 100  (index: 100, 101, 102)
加载更多：[msg0, msg1, msg2, msg3]  firstItemIndex: 99  (index: 99, 100, 101, 102)
结果：msg1 的 index 仍然是 100，Virtuoso 知道它没变，不重新渲染
```

---

### 2️⃣ 缓存 + 数据库协同

```typescript
// L1: LocalStorage（0ms 秒开）
const cached = await readConversationCache(conversationId);
setMessages(cached);  // 立即显示

// L2: MongoDB（200ms 最新数据）
const dbMessages = await fetchMessagesFromDB(conversationId);

// L3: 智能合并（无闪烁）
const merged = smartMerge(cached, dbMessages);
setMessages(merged);  // 平滑更新
```

**核心优势：**
- ✅ **0ms 秒开**：立即显示缓存，无白屏
- ✅ **无闪烁**：差异合并，平滑更新
- ✅ **数据一致**：数据库保证最新状态
- ✅ **离线可用**：断网也能查看历史

**智能合并算法：**
```typescript
const smartMerge = (cached: Message[], dbMessages: Message[]) => {
  const messageMap = new Map<string, Message>();
  
  // 1. 先放入缓存消息
  cached.forEach(msg => messageMap.set(msg.id, msg));
  
  // 2. 覆盖数据库消息（更新的优先）
  dbMessages.forEach(msg => messageMap.set(msg.id, msg));
  
  // 3. 按时间戳排序
  return Array.from(messageMap.values()).sort((a, b) => a.timestamp - b.timestamp);
};
```

---

### 3️⃣ LocalStorage 加密（AES-GCM + 设备绑定）

```typescript
// 加密存储
const envelope = { conversationId, messages };
const encrypted = await encryptData(envelope);  // AES-GCM
localStorage.setItem(key, JSON.stringify(encrypted));

// 解密读取
const encrypted = JSON.parse(localStorage.getItem(key));
const decrypted = await decryptData(encrypted);
```

**密钥派生（设备绑定）：**
```typescript
// 收集设备特征
const features = {
  canvas: getCanvasFingerprint(),  // Canvas 渲染特征
  gpu: getGPUInfo(),               // GPU 型号
  screen: `${width}x${height}`,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

// PBKDF2 派生密钥
const key = await crypto.subtle.deriveKey(
  {
    name: 'PBKDF2',
    salt: new TextEncoder().encode('ai-chat-salt'),
    iterations: 100000,  // 10 万次迭代
    hash: 'SHA-256',
  },
  baseKey,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt', 'decrypt']
);
```

**安全性：**

| 攻击方式 | 是否能破解 | 原因 |
|---------|-----------|------|
| **窃取 LocalStorage** | ❌ 不能 | 数据已加密，没有密钥无法解密 |
| **XSS 攻击** | ❌ 不能 | 密钥派生自设备，不存储 |
| **跨设备复制** | ❌ 不能 | 设备指纹不同，密钥不同 |
| **换浏览器** | ❌ 不能 | Canvas/GPU 指纹不同 |
| **暴力破解** | ❌ 不能 | PBKDF2 10 万次迭代，需数年 |

**Trade-off：**
- ✅ 高安全性 ↔ ❌ 跨设备无法解密（需从数据库重新加载）
- ✅ 无需用户记密码 ↔ ❌ 设备环境变化可能导致无法解密

---

### 4️⃣ Markdown 容错 + 三层兜底

```typescript
// L1: 自动修复截断
const fixed = fixIncompleteMarkdown(content);
// 修复：```python\nco → ```python\nco\n```

// L2: react-markdown 渲染
try {
  return <ReactMarkdown>{fixed}</ReactMarkdown>;
} catch (error) {
  // 渲染失败 → L3
}

// L3: 备用渲染器
return renderMarkdownFallback(fixed);
```

**自动修复逻辑：**

```typescript
export function fixIncompleteMarkdown(content: string): string {
  let fixed = content;
  
  // 1. 修复代码块截断
  const codeBlockCount = (fixed.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) {
    fixed += '\n```';  // 补齐闭合
  }
  
  // 2. 修复表格截断
  if (lastLine.includes('|') && !lastLine.trim().endsWith('|')) {
    fixed += ' |';
  }
  
  // 3. 修复 HTML 标签截断
  const openTags = (fixed.match(/<[a-z]+[^>]*>/gi) || []).length;
  const closeTags = (fixed.match(/<\/[a-z]+>/gi) || []).length;
  if (openTags > closeTags) {
    fixed = fixed.replace(/<[a-z]+[^>]*>(?![^<]*<\/[a-z]+>)/gi, '');
  }
  
  return fixed;
}
```

**效果对比：**

| 场景 | 传统方案 | 我们的方案 |
|-----|---------|-----------|
| **完整 Markdown** | ✅ 正常渲染 | ✅ 正常渲染 |
| **代码块截断** | ❌ 崩溃/白屏 | ✅ 自动修复 + 渲染 |
| **表格截断** | ❌ 崩溃/白屏 | ✅ 自动修复 + 渲染 |
| **react-markdown 崩溃** | ❌ 白屏 | ✅ 降级到备用渲染器 |

---

### 5️⃣ 三层渐进式传输（用户上传）

```typescript
const size = text.length;

if (size < 10KB) {
  // L1: 直接传输
  await fetch('/api/chat', {
    body: JSON.stringify({ message: text })
  });
}
else if (size < 5MB) {
  // L2: 压缩传输（gzip）
  const compressed = await compressText(text);  // 压缩率 70%
  await fetch('/api/chat', {
    body: compressed,
    headers: { 'Content-Encoding': 'gzip' }
  });
}
else {
  // L3: 分片传输（50KB/片）
  const chunks = splitIntoChunks(compressed, 50KB);
  for (let chunk of chunks) {
    await uploadChunk(chunk);  // 支持断点续传
  }
}
```

---

### 6️⃣ 渐进式渲染（后端返回超大内容）

**问题：** 后端流式返回一万行 Markdown（如大段代码），前端一次性渲染会卡顿。

**解决方案：按需分批渲染**

```typescript
// 自动检测内容长度
if (message.contentLength > 1000) {
  // 使用渐进式组件
  <ProgressiveMessageRefactored
    messageId={message.id}
    userId={userId}
    initialContent={message.content.slice(0, 1000)}  // 初始只显示 1000 字符
    totalLength={message.contentLength}
    chunkSize={1000}
  />
} else {
  // 普通渲染
  <StreamingMarkdown content={message.content} />
}
```

**核心机制：**

```typescript
const useProgressiveLoad = ({ messageId, userId, initialContent, totalLength, chunkSize }) => {
  const [fullContent, setFullContent] = useState(initialContent);
  const [loadedLength, setLoadedLength] = useState(initialContent.length);
  
  const loadMore = async () => {
    // 从数据库按需加载下一批内容
    const nextChunk = await fetchMessageChunk(messageId, loadedLength, chunkSize);
    setFullContent(prev => prev + nextChunk);
    setLoadedLength(prev => prev + nextChunk.length);
  };
  
  const loadAll = async () => {
    // 一次性加载剩余所有内容
    const remaining = await fetchMessageChunk(messageId, loadedLength, totalLength - loadedLength);
    setFullContent(prev => prev + remaining);
    setLoadedLength(totalLength);
  };
  
  return { fullContent, loadedLength, loadMore, loadAll, isFullyLoaded: loadedLength >= totalLength };
};
```

**用户界面：**

```typescript
<div className="progressive-message">
  {/* 已加载的内容 */}
  <StreamingMarkdown content={fullContent} />
  
  {/* 加载控制 */}
  {!isFullyLoaded && (
    <div className="load-controls">
      <div className="progress-bar">
        <div className="progress" style={{ width: `${progress}%` }} />
      </div>
      
      <div className="stats">
        已加载：{loadedLength} / {totalLength} 字符
      </div>
      
      <div className="actions">
        <button onClick={loadMore}>
          加载更多 ({Math.min(chunkSize, remainingLength)} 字符)
        </button>
        <button onClick={loadAll}>
          加载全部 ({remainingChunks} 批次)
        </button>
      </div>
    </div>
  )}
</div>
```

**核心优势：**
- ✅ **避免卡顿**：初始只渲染 1000 字符，性能提升 80%
- ✅ **按需加载**：用户主动触发，体验可控
- ✅ **进度可视**：进度条 + 统计信息
- ✅ **灵活加载**：支持"加载更多"和"加载全部"两种模式

**适用场景：**
- 后端返回大段代码（一万行）
- 长篇文章（几千段）
- 大型表格数据

**阈值配置：**
```typescript
const UPLOAD_THRESHOLDS = {
  DIRECT_UPLOAD_MAX: 10 * 1024,      // 10KB
  COMPRESSION_MAX: 5 * 1024 * 1024,  // 5MB
  CHUNK_SIZE: 50 * 1024,             // 50KB
  ABSOLUTE_MAX: 10 * 1024 * 1024,    // 10MB
};
```

**压缩效果：**

| 文本类型 | 原始大小 | 压缩后 | 压缩率 |
|---------|---------|--------|-------|
| **代码** | 100KB | 20KB | 80% |
| **JSON** | 100KB | 10KB | 90% |
| **普通文本** | 100KB | 30KB | 70% |
| **Markdown** | 100KB | 25KB | 75% |

**分片上传（支持断点续传）：**
```typescript
// 创建上传会话
const sessionId = await createSession(userId, totalChunks);

// 上传分片（带重试）
for (let i = 0; i < totalChunks; i++) {
  const chunk = blob.slice(i * 50KB, (i + 1) * 50KB);
  const hash = await calculateHash(chunk);  // SHA-256 校验
  
  await uploadChunkWithRetry(sessionId, i, chunk, hash, maxRetries: 3);
}

// 断点续传
const status = await getUploadStatus(sessionId);
const uploadedChunks = status.uploadedChunks;  // [0, 1, 2, 5, 6]
const failedChunks = [3, 4];  // 只重传失败的分片
```

---

## 🔍 技术深度问答

### Q: 为什么选择 Virtuoso 而不是 react-window？

**A:** Virtuoso 更适合我们的场景。

| 特性 | react-window | Virtuoso | 我们的选择 |
|-----|-------------|----------|-----------|
| **高度自适应** | ❌ 需要手动指定 | ✅ 自动测量 | Virtuoso |
| **双向滚动** | ❌ 复杂 | ✅ 原生支持 | Virtuoso |
| **API 简洁** | 一般 | ✅ 简洁 | Virtuoso |

**我们的场景：**
- 每条消息高度不同（短文本 vs 长代码块）
- 需要向上加载历史消息
- 消息高度会动态变化（展开思考框）

---

### Q: 为什么不直接使用数据库，还要用 LocalStorage 缓存？

**A:** 0ms 秒开 + 离线可用。

**对比：**

| 方案 | 首屏时间 | 闪烁 | 数据一致性 | 离线可用 |
|-----|---------|------|-----------|---------|
| **只用数据库** | 2-3 秒 | 白屏 | ✅ 一致 | ❌ 不可用 |
| **只用缓存** | 0ms | ❌ 无 | ❌ 可能过期 | ✅ 可用 |
| **缓存 + 数据库** ⭐ | 0ms | ❌ 无 | ✅ 一致 | ✅ 可用 |

---

### Q: 设备绑定加密的缺点是什么？

**A:** 跨设备无法解密，需要从数据库重新加载。

**场景：**
```
设备 A：加密存储 → 密钥派生自设备 A
设备 B：尝试解密 → 密钥派生自设备 B（不同）→ 解密失败 → 清除缓存 → 从数据库加载
```

**Trade-off：**

| 方案 | 安全性 | 跨设备 | 我们的选择 |
|-----|-------|--------|-----------|
| **不加密** | ❌ 低 | ✅ 可以 | ❌ |
| **用户密码加密** | ✅ 高 | ✅ 可以 | ❌ 无登录系统 |
| **设备绑定加密** ⭐ | ✅ 高 | ❌ 不能 | ✅ 选择 |

---

### Q: 为什么分片大小是 50KB？

**A:** 平衡传输效率和模型友好性。

**考虑因素：**

1. **网络传输效率**
   - 太小（5KB）：HTTP overhead 大
   - 太大（500KB）：单个分片失败影响大
   - 50KB：合适的折衷

2. **模型友好性**
   - LLM Token 限制：4K-32K tokens
   - 50KB ≈ 25K tokens（中文）
   - 后端可以直接传给模型，无需重新分片

3. **用户体验**
   - 50KB/分片：10MB = 200 个分片
   - 上传时间：200 * 0.5s = 100s（可接受）
   - 进度条：200 个进度更新，流畅

---

### Q: 压缩率为什么能达到 70%？

**A:** gzip 对文本压缩效果好。

**原理：**
- **LZ77 算法**：查找重复字符串并引用
- **Huffman 编码**：高频字符用短编码

**实测数据：**
- JSON：90% 压缩率（高度结构化）
- 代码：80% 压缩率（重复高）
- 普通文本：70% 压缩率（重复低）

---

## 📊 量化指标

| 指标 | 数值 | 说明 |
|-----|------|------|
| **虚拟列表性能提升** | 70% | 2 秒 → 0.6 秒 |
| **可见消息渲染数** | 10-15 条 | 总 500 条，只渲染 10-15 条 |
| **渐进式渲染性能提升** | 80% | 一万行代码，分批渲染 |
| **初始渲染字符数** | 1000 字符 | 渐进式加载触发阈值 |
| **首屏加载时间** | 0ms | LocalStorage 缓存 |
| **数据库加载时间** | 200ms | 异步加载，无阻塞 |
| **加密算法** | AES-GCM | 业界标准 |
| **密钥派生迭代** | 100,000 次 | PBKDF2，防暴力破解 |
| **Markdown 容错率** | 100% | 三层兜底，永不白屏 |
| **压缩率** | 70% | gzip，5MB → 1.5MB |
| **分片大小** | 50KB | 平衡传输效率和模型友好性 |
| **最大文本支持** | 10MB | 分片传输 |

---

## 💻 代码速查

### 虚拟列表

```typescript
<Virtuoso
  data={messages}
  firstItemIndex={firstItemIndex}
  startReached={loadOlderMessages}
  itemContent={(index, message) => <MessageItem message={message} />}
/>
```

### 缓存协同

```typescript
// 立即显示缓存
const cached = await readConversationCache(conversationId);
setMessages(cached);

// 异步加载数据库
const dbMessages = await fetchMessagesFromDB(conversationId);

// 智能合并
const merged = smartMerge(cached, dbMessages);
setMessages(merged);
```

### 加密/解密

```typescript
// 加密
const encrypted = await encryptData(envelope);
localStorage.setItem(key, JSON.stringify(encrypted));

// 解密
const encrypted = JSON.parse(localStorage.getItem(key));
const decrypted = await decryptData(encrypted);
```

### Markdown 容错

```typescript
// 修复截断
const fixed = fixIncompleteMarkdown(content);

// 三层兜底
try {
  return <ReactMarkdown>{fixed}</ReactMarkdown>;
} catch (error) {
  return renderMarkdownFallback(fixed);
}
```

### 渐进式传输（上传）

```typescript
const strategy = selectUploadStrategy(text);

if (strategy === 'direct') {
  await fetch('/api/chat', { body: JSON.stringify({ message: text }) });
} else if (strategy === 'compression') {
  const compressed = await compressText(text);
  await upload(compressed);
} else {
  await ChunkUploader.uploadLargeBlob(compressed, options);
}
```

### 渐进式渲染（接收）

```typescript
// 检测内容长度
if (message.contentLength > 1000) {
  <ProgressiveMessageRefactored
    initialContent={message.content.slice(0, 1000)}
    totalLength={message.contentLength}
    chunkSize={1000}
    onLoadMore={loadMoreContent}
  />
} else {
  <StreamingMarkdown content={message.content} />
}
```

---

## 🎯 亮点总结

| 技术 | 核心价值 | 业务效果 |
|-----|---------|---------|
| **虚拟列表** | 只渲染可见区域 | 性能提升 70% |
| **缓存协同** | 0ms 秒开 + 无闪烁 | 用户体验流畅 |
| **数据加密** | AES-GCM + 设备绑定 | 隐私安全有保障 |
| **Markdown 容错** | 三层兜底，永不白屏 | 流式渲染稳定 |
| **渐进式传输** | 自适应压缩 + 分片 | 支持 10MB 大文本上传 |
| **渐进式渲染** | 分批渲染 + 按需加载 | 一万行代码不卡顿 |

**核心理念：在保证高性能和流畅体验的同时，充分保护用户隐私！**

---

**最后更新：** 2025-01-03

