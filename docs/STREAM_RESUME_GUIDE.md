# 流式续传功能指南

## 🎯 功能概述

当前端网络波动或暂时断开连接时，**模型继续生成内容**并保存到 MongoDB，前端重连后可以从断点继续接收剩余内容，避免重新生成浪费 token 和时间。

---

## 📋 核心特性

### ✅ 已实现

1. **模型不中断**
   - 前端断开连接时，模型继续生成
   - 后端持续接收模型输出并累积到内存
   - 批量保存到 MongoDB（每1秒或每100字符）

2. **续流请求**
   - 前端重连时发送 `resumeFrom` 参数
   - 后端从 MongoDB 读取完整内容
   - 只发送未接收的部分（模拟打字机效果）

3. **MongoDB 批量更新策略**
   - 避免频繁写入，减少数据库压力
   - 每1秒更新一次 OR 每100字符更新一次
   - TTL 索引自动清理过期进度（30分钟）

4. **多实例友好**
   - 使用 MongoDB 作为共享存储
   - 前端可以重连到不同的服务器实例

---

## 🏗️ 架构设计

### 数据流图

```
用户请求 → AI 模型开始生成
                ↓
        前端接收300字 → 网络波动/断开连接
                ↓
        【关键】模型继续生成（不中断）
                ↓
        后端继续接收模型输出（301-800字）
                ↓
        StreamProgressManager 批量保存到 MongoDB
                ↓
        前端重连 + 发送 resumeFrom: { messageId, position: 300 }
                ↓
        后端从 MongoDB 读取完整内容（800字）
                ↓
        只发送第301-800字 ✅（模拟打字机效果）
```

---

## 💾 数据模型

### StreamProgress Entity

```typescript
interface StreamProgress {
  /** 消息ID（关联到 messages 表） */
  messageId: string;

  /** 用户ID */
  userId: string;

  /** 会话ID */
  conversationId: string;

  /** 已累积的完整文本内容 */
  accumulatedText: string;

  /** 思考过程（如果有） */
  thinking?: string;

  /** 搜索来源（如果有） */
  sources?: Array<{ title: string; url: string }>;

  /** 模型类型 */
  modelType: 'local' | 'volcano';

  /** 流式生成状态 */
  status: 'streaming' | 'completed' | 'error';

  /** 前端最后接收到的位置（字符索引） */
  lastSentPosition: number;

  /** 最后更新时间（用于 TTL 索引） */
  lastUpdateAt: Date;

  /** 创建时间 */
  createdAt: Date;

  /** 错误信息（如果失败） */
  error?: string;
}
```

### MongoDB 索引

| 索引 | 类型 | 用途 |
|------|------|------|
| `messageId` | 唯一索引 | 快速查找进度 |
| `userId` | 普通索引 | 用户级查询 |
| `conversationId` | 普通索引 | 会话级查询 |
| `lastUpdateAt` | TTL 索引 | 30分钟后自动清理 |

---

## 🔧 核心模块

### 1. StreamProgressManager

**职责：** 批量更新策略，避免频繁写入 MongoDB

**配置：**
```typescript
new StreamProgressManager(repository, {
  updateIntervalMs: 1000,  // 每1秒更新一次
  updateCharThreshold: 100, // 或每100字符更新一次
});
```

**核心方法：**
```typescript
// 更新进度（带批量策略）
await progressManager.updateProgress(
  messageId,
  accumulatedText,
  { userId, conversationId, modelType, thinking, sources }
);

// 标记完成
await progressManager.markCompleted(
  messageId,
  finalText,
  thinking,
  sources
);

// 获取进度
const progress = await progressManager.getProgress(messageId);
```

---

### 2. singleAgentHandler 修改

**关键改动：**

#### Before（旧逻辑）：
```typescript
for await (const chunk of stream) {
  if (sseWriter.isClosed()) {
    console.log('客户端已断开，停止读取模型流');
    await stream.cancel(); // ❌ 中断模型
    return;
  }
  // ...
}
```

#### After（新逻辑）：
```typescript
for await (const chunk of stream) {
  accumulatedText += chunk;
  
  // ✅ 尝试发送（如果连接还在）
  if (!sseWriter.isClosed()) {
    await controlledWriter.sendEvent(accumulatedText);
  } else {
    // 🔥 关键：前端断开，但继续累积（不中断模型）
    console.log('前端断开，继续累积模型输出（续流模式）');
  }
  
  // ✅ 批量更新进度到 MongoDB
  await progressManager.updateProgress(
    messageId,
    accumulatedText,
    { userId, conversationId, modelType, thinking, sources }
  );
}

// ✅ 标记完成
await progressManager.markCompleted(messageId, finalText);
```

---

### 3. chat.ts 续流请求处理

**请求参数：**
```typescript
interface ChatRequestData {
  message: string;
  modelType: 'local' | 'volcano';
  conversationId?: string;
  userId: string;
  // ... 其他参数
  
  /** 续流参数 */
  resumeFrom?: {
    messageId: string;  // 要续传的消息ID
    position: number;   // 前端已接收的字符位置
  };
}
```

**处理逻辑：**
```typescript
// 1. 检测续流请求
if (resumeFrom && resumeFrom.messageId) {
  // 2. 从 MongoDB 读取进度
  const progress = await streamProgressRepo.findByMessageId(resumeFrom.messageId);
  
  if (progress) {
    // 3. 计算剩余内容
    const remainingText = progress.accumulatedText.slice(resumeFrom.position);
    
    // 4. 使用打字机效果发送剩余内容
    for (let i = 10; i <= remainingText.length; i += 10) {
      await controlledWriter.sendEvent(
        remainingText.slice(0, i),
        { thinking: progress.thinking, sources: progress.sources }
      );
    }
  }
}
```

---

## 📡 前端集成指南

### 1. 检测连接中断

```typescript
// src/hooks/data/useSSEStream.ts

let lastReceivedPosition = 0;
let lastMessageId = '';

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.content) {
    lastReceivedPosition = data.content.length;
    lastMessageId = data.messageId || clientAssistantMessageId;
  }
};

eventSource.onerror = (error) => {
  console.error('连接中断');
  
  // 保存断点信息
  sessionStorage.setItem('resumeInfo', JSON.stringify({
    messageId: lastMessageId,
    position: lastReceivedPosition,
  }));
};
```

---

### 2. 重连时续传

```typescript
// 检查是否有未完成的续传
const resumeInfoStr = sessionStorage.getItem('resumeInfo');
let resumeFrom = null;

if (resumeInfoStr) {
  resumeFrom = JSON.parse(resumeInfoStr);
  console.log('检测到续传信息:', resumeFrom);
}

// 发送续流请求
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: originalMessage,  // 原始消息
    userId,
    conversationId,
    modelType,
    resumeFrom,  // ✅ 续传参数
  }),
});

// 如果续传成功，清除保存的信息
if (response.ok) {
  sessionStorage.removeItem('resumeInfo');
}
```

---

### 3. 续传响应识别

```typescript
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  // 检测是否为续传响应
  if (data.mode === 'resume' && data.resumed) {
    console.log(`✅ 续传成功，从位置 ${data.startPosition} 继续`);
    // 可以显示提示："正在继续接收..."
  }
  
  // 正常处理内容
  if (data.content) {
    updateMessage(data.content);
  }
};
```

---

## 🧪 测试场景

### 场景 1: 正常续传

```
1. 用户发送消息
2. 模型生成 500 字
3. 前端接收 300 字 → 网络中断
4. 后端继续接收并保存剩余 200 字
5. 前端重连，发送 resumeFrom: { messageId, position: 300 }
6. 后端返回第 301-500 字 ✅
```

### 场景 2: 模型未完成

```
1. 用户发送消息
2. 模型生成到 300 字 → 前端断开
3. 后端继续接收，模型最终生成 800 字
4. 前端重连（30秒后）
5. 后端返回第 301-800 字 ✅
```

### 场景 3: TTL 过期

```
1. 用户发送消息
2. 模型生成 500 字
3. 前端接收 300 字 → 网络中断
4. 35 分钟后重连（超过 30 分钟 TTL）
5. MongoDB 已自动清理进度
6. 后端返回错误："未找到进度记录，可能已过期" ❌
```

---

## ⚙️ 配置参数

### MongoDB 批量更新策略

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `updateIntervalMs` | 1000ms | 更新时间间隔 |
| `updateCharThreshold` | 100字符 | 更新字符数阈值 |

**性能估算：**
- 30秒会话 → ~30 次 MongoDB 写入
- 60秒会话 → ~60 次 MongoDB 写入
- MongoDB Atlas M0（免费层）可处理 ~100 写入/秒 ✅

---

### TTL 清理策略

| 参数 | 值 | 说明 |
|------|------|------|
| `expireAfterSeconds` | 1800秒 (30分钟) | 进度过期时间 |

**原因：**
- 大多数续传在几秒内完成
- 30分钟足够处理绝大多数网络波动
- 避免垃圾数据累积

---

## 🚀 性能优化

### 1. 批量更新策略

```typescript
// ❌ 不好：每个字符都写入
for await (const chunk of stream) {
  await mongodb.update({ content: accumulatedText }); // 每次都写
}

// ✅ 好：批量写入
for await (const chunk of stream) {
  accumulatedText += chunk;
  
  // 满足条件才写入
  if (shouldUpdate()) {
    await mongodb.update({ content: accumulatedText });
  }
}
```

---

### 2. 异步更新（不阻塞流）

```typescript
// ✅ 使用 catch 而不是 await
progressManager.updateProgress(...).catch(console.error);

// 不阻塞流式传输
await controlledWriter.sendEvent(content);
```

---

### 3. TTL 自动清理

```typescript
// ✅ MongoDB 自动清理过期数据，无需手动干预
await collection.createIndex(
  { lastUpdateAt: 1 },
  { expireAfterSeconds: 1800 }
);
```

---

## 🛠️ 故障排查

### 问题 1: "未找到进度记录"

**可能原因：**
1. TTL 过期（超过30分钟）
2. MongoDB 写入失败
3. messageId 不匹配

**解决方案：**
- 检查 MongoDB 中是否有 `stream_progress` 记录
- 检查 TTL 索引是否正确创建
- 检查 messageId 是否一致

---

### 问题 2: 续传内容重复

**可能原因：**
- 前端 `position` 参数错误

**解决方案：**
```typescript
// ✅ 确保 position 是已接收的最后字符位置
lastReceivedPosition = data.content.length; // 不是 +1
```

---

### 问题 3: MongoDB 写入频繁

**可能原因：**
- 批量策略阈值设置过小

**解决方案：**
```typescript
// 调整阈值
new StreamProgressManager(repository, {
  updateIntervalMs: 2000,  // 增加到2秒
  updateCharThreshold: 200, // 增加到200字符
});
```

---

## 📊 监控指标

### 关键指标

| 指标 | 监控方法 | 预期值 |
|------|----------|--------|
| MongoDB 写入频率 | 日志统计 | ~1次/秒 |
| 续传成功率 | 前端埋点 | >95% |
| 续传响应时间 | 服务器日志 | <500ms |
| TTL 清理数量 | MongoDB 统计 | 自动清理 |

### 日志示例

```
✅ [StreamProgress] 更新进度: messageId=xxx, length=350
✅ [StreamProgress] 标记为完成: messageId=xxx, length=800
🔄 [Resume] 续流请求: messageId=xxx, position=300
✅ [Resume] 找到进度，续传 500 字符（从位置 300 开始）
```

---

## 🔐 安全考虑

### 1. 用户权限验证

```typescript
// ✅ 验证 messageId 属于该用户
const progress = await streamProgressRepo.findByMessageId(messageId);
if (progress && progress.userId !== userId) {
  throw new Error('无权访问此消息');
}
```

---

### 2. TTL 保护隐私

```typescript
// ✅ 30分钟后自动删除，避免敏感内容泄露
expireAfterSeconds: 1800
```

---

## 🎉 总结

### 优势

1. ✅ **节省资源**：避免重新生成，节省 token 和时间
2. ✅ **用户体验好**：网络波动无感知
3. ✅ **多实例友好**：使用 MongoDB 共享状态
4. ✅ **性能优化**：批量更新策略
5. ✅ **自动清理**：TTL 索引避免垃圾数据

### 局限

1. ⚠️ 30分钟 TTL 限制
2. ⚠️ 需要前端配合实现续传逻辑
3. ⚠️ MongoDB 写入频率依赖批量策略

---

## 📚 相关文档

- [ADAPTIVE_STREAMING_GUIDE.md](./ADAPTIVE_STREAMING_GUIDE.md) - 自适应流式控制
- [REQUEST_CACHE_GUIDE.md](./REQUEST_CACHE_GUIDE.md) - 请求缓存系统
- [CACHE_CLEANUP_STRATEGY.md](./CACHE_CLEANUP_STRATEGY.md) - 缓存清理策略

