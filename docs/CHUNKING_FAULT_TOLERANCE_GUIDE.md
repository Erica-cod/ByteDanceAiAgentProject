# 大文本分片处理容错机制指南

## 📋 问题场景分析

### 当前架构回顾

```
用户输入框 (完整文本)
    ↓
前端一次性 HTTP POST (完整文本)
    ↓
后端接收完整文本
    ↓
后端切分成 chunks (splitTextIntoChunks)
    ↓
后端串行处理每个 chunk (调用模型 API)
    ↓
SSE 流式返回结果给前端
```

**关键发现**: 
- ❌ **不存在"用户分片上传"** - 前端是一次性发送完整文本
- ✅ **存在"后端分片处理"** - 后端将文本切分成多个 chunk 处理

---

## 🔍 需要解决的两类问题

### 问题 1: 前端上传时网络中断

#### 当前情况
```typescript
// src/hooks/data/useSSEStream.ts
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: messageText,  // ⚠️ 完整文本,可能有几万字符
    // ...其他参数
  }),
  signal,
});
```

**问题**:
- 如果文本有 50,000 字符,网络传输需要时间
- 如果在上传过程中网络中断,整个请求失败
- 用户需要重新粘贴和发送整个文本

#### 影响范围
- **小文本 (<10KB)**: 影响不大,上传通常在 100-200ms 内完成
- **中等文本 (10-100KB)**: 弱网环境下可能失败
- **超大文本 (>100KB)**: 移动网络或弱网环境下失败概率高

---

### 问题 2: 后端处理分片时的网络问题

#### 2.1 调用模型 API 时网络中断

**当前情况**:
```typescript
// api/services/chunkingPlanReviewService.ts
for (let i = 0; i < chunks.length; i++) {
  const chunk = chunks[i];
  
  // 调用模型分析这个 chunk
  const chunkData = await processChunk(chunk, i, chunks.length);
  extractedDataList.push(chunkData);
}
```

```typescript
// processChunk 内部
async function processChunk(chunk, chunkIndex, totalChunks) {
  try {
    const stream = await callVolcengineModel(messages);
    // 读取流...
  } catch (error) {
    // ✅ 已有容错: 返回空数据,不中断整个流程
    console.error(`❌ [Chunking] Chunk ${chunkIndex} 处理失败:`, error);
    return { goals: [], milestones: [], tasks: [], /* ... */ };
  }
}
```

**现有容错**:
- ✅ 单个 chunk 失败不会中断整个流程
- ✅ 失败的 chunk 返回空数据
- ⚠️ 但该 chunk 的内容会**永久丢失**

#### 2.2 SSE 连接中断

**当前情况**:
```typescript
// 后端检测 SSE 是否关闭
if (sseWriter.isClosed()) {
  console.log('⚠️ [Chunking] 客户端已断开，停止处理');
  return;  // ⚠️ 直接退出,不保存进度
}
```

**前端重连机制**:
```typescript
// src/hooks/data/useSSEStream.ts
let attempt = 0;
while (true) {
  const result = await runStreamOnce();
  if (result.completed) break;
  
  if (attempt >= MAX_RECONNECT_ATTEMPTS) {
    throw new Error('SSE 连接中断，已达到最大重试次数');
  }
  
  // ⚠️ 重连时重新发送完整请求,后端会重新处理所有 chunk
  await sleep(waitMs);
  attempt += 1;
}
```

**问题**:
- ⚠️ SSE 中断后,前端会重连并重新发送请求
- ⚠️ 后端没有保存 chunking 进度,会**从头开始**处理所有 chunk
- ⚠️ 如果已处理 20/30 个 chunk,重连后会浪费前面的工作

---

## ✅ 解决方案

### 方案 A: 前端上传容错 (真正的分片上传)

#### A1: 实现前端分片上传

```typescript
// 新文件: src/utils/chunkUploader.ts

interface UploadChunk {
  index: number;
  content: string;
  hash: string;  // 用于去重和断点续传
}

interface UploadSession {
  sessionId: string;
  totalChunks: number;
  uploadedChunks: Set<number>;
}

/**
 * 前端分片上传器
 */
export class ChunkUploader {
  private static readonly CHUNK_SIZE = 50000; // 50KB 每片
  private static readonly MAX_RETRIES = 3;
  
  /**
   * 将文本切分成适合上传的小片
   */
  static splitForUpload(text: string): UploadChunk[] {
    const chunks: UploadChunk[] = [];
    
    for (let i = 0; i < text.length; i += this.CHUNK_SIZE) {
      const content = text.slice(i, i + this.CHUNK_SIZE);
      chunks.push({
        index: i / this.CHUNK_SIZE,
        content,
        hash: this.simpleHash(content),
      });
    }
    
    return chunks;
  }
  
  /**
   * 分片上传主函数
   */
  static async uploadWithRetry(
    text: string,
    userId: string,
    options: {
      onProgress?: (uploaded: number, total: number) => void;
      onChunkComplete?: (chunkIndex: number) => void;
    } = {}
  ): Promise<string> {
    // 1. 检查是否需要分片 (小于 50KB 直接上传)
    if (text.length < this.CHUNK_SIZE) {
      return this.uploadComplete(text, userId);
    }
    
    // 2. 切分文本
    const chunks = this.splitForUpload(text);
    console.log(`📤 [Upload] 文本切分为 ${chunks.length} 片`);
    
    // 3. 创建上传会话
    const sessionId = await this.createUploadSession(userId, chunks.length);
    
    // 4. 上传每一片 (支持断点续传)
    const uploadedSet = new Set<number>();
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // 尝试上传,失败后重试
      let success = false;
      for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
        try {
          await this.uploadChunk(sessionId, chunk);
          uploadedSet.add(i);
          success = true;
          
          options.onChunkComplete?.(i);
          options.onProgress?.(uploadedSet.size, chunks.length);
          
          break;
        } catch (error) {
          console.warn(`⚠️ [Upload] 第 ${i} 片上传失败 (尝试 ${attempt + 1}/${this.MAX_RETRIES})`, error);
          
          if (attempt === this.MAX_RETRIES - 1) {
            throw new Error(`第 ${i} 片上传失败,已达最大重试次数`);
          }
          
          // 指数退避
          await this.sleep(1000 * Math.pow(2, attempt));
        }
      }
    }
    
    // 5. 通知后端所有片已上传完成
    await this.completeUpload(sessionId);
    
    return sessionId;
  }
  
  /**
   * 上传单个分片
   */
  private static async uploadChunk(sessionId: string, chunk: UploadChunk): Promise<void> {
    const response = await fetch('/api/upload/chunk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        chunkIndex: chunk.index,
        content: chunk.content,
        hash: chunk.hash,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }
  
  /**
   * 创建上传会话
   */
  private static async createUploadSession(userId: string, totalChunks: number): Promise<string> {
    const response = await fetch('/api/upload/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, totalChunks }),
    });
    
    if (!response.ok) {
      throw new Error('创建上传会话失败');
    }
    
    const data = await response.json();
    return data.sessionId;
  }
  
  /**
   * 完成上传 (小文本直接上传)
   */
  private static async uploadComplete(text: string, userId: string): Promise<string> {
    const response = await fetch('/api/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, text }),
    });
    
    if (!response.ok) {
      throw new Error('上传失败');
    }
    
    const data = await response.json();
    return data.sessionId;
  }
  
  /**
   * 通知上传完成
   */
  private static async completeUpload(sessionId: string): Promise<void> {
    await fetch('/api/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
  }
  
  private static simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
  
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

#### A2: 后端 API 实现

```typescript
// 新文件: api/lambda/upload.ts

import { RequestOption } from '@modern-js/runtime/server';
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
});

/**
 * POST /api/upload/session - 创建上传会话
 */
export async function post_session({
  data,
}: RequestOption<any, { userId: string; totalChunks: number }>) {
  const { userId, totalChunks } = data;
  
  const sessionId = `upload_${userId}_${Date.now()}`;
  
  // 在 Redis 中初始化会话
  await redis.hset(`upload:${sessionId}`, {
    userId,
    totalChunks,
    uploadedChunks: '[]',
    status: 'uploading',
    createdAt: Date.now(),
  });
  
  // 设置 1 小时过期
  await redis.expire(`upload:${sessionId}`, 3600);
  
  return {
    sessionId,
    expiresIn: 3600,
  };
}

/**
 * POST /api/upload/chunk - 上传单个分片
 */
export async function post_chunk({
  data,
}: RequestOption<any, {
  sessionId: string;
  chunkIndex: number;
  content: string;
  hash: string;
}>) {
  const { sessionId, chunkIndex, content, hash } = data;
  
  // 检查会话是否存在
  const exists = await redis.exists(`upload:${sessionId}`);
  if (!exists) {
    return {
      status: 404,
      data: { error: '上传会话不存在或已过期' },
    };
  }
  
  // 保存分片内容
  await redis.set(
    `upload:${sessionId}:chunk:${chunkIndex}`,
    content,
    'EX',
    3600  // 1 小时过期
  );
  
  // 更新已上传分片列表
  const uploadedStr = await redis.hget(`upload:${sessionId}`, 'uploadedChunks');
  const uploaded = JSON.parse(uploadedStr || '[]');
  if (!uploaded.includes(chunkIndex)) {
    uploaded.push(chunkIndex);
    await redis.hset(`upload:${sessionId}`, 'uploadedChunks', JSON.stringify(uploaded));
  }
  
  console.log(`✅ [Upload] 会话 ${sessionId} 第 ${chunkIndex} 片上传完成 (${uploaded.length} 片)`);
  
  return {
    success: true,
    uploadedChunks: uploaded.length,
  };
}

/**
 * POST /api/upload/complete - 完成上传
 */
export async function post_complete({
  data,
}: RequestOption<any, { sessionId?: string; userId?: string; text?: string }>) {
  // 场景1: 小文本直接上传
  if (data.text && data.userId) {
    const sessionId = `upload_${data.userId}_${Date.now()}`;
    await redis.set(
      `upload:${sessionId}:text`,
      data.text,
      'EX',
      3600
    );
    
    await redis.hset(`upload:${sessionId}`, {
      userId: data.userId,
      totalChunks: 1,
      status: 'completed',
      createdAt: Date.now(),
    });
    
    return { sessionId };
  }
  
  // 场景2: 分片上传完成,合并文本
  const { sessionId } = data;
  if (!sessionId) {
    return {
      status: 400,
      data: { error: '缺少 sessionId 或 text 参数' },
    };
  }
  
  const session = await redis.hgetall(`upload:${sessionId}`);
  if (!session.userId) {
    return {
      status: 404,
      data: { error: '上传会话不存在' },
    };
  }
  
  const totalChunks = parseInt(session.totalChunks);
  const uploadedChunks = JSON.parse(session.uploadedChunks || '[]');
  
  if (uploadedChunks.length !== totalChunks) {
    return {
      status: 400,
      data: {
        error: '部分分片未上传',
        uploaded: uploadedChunks.length,
        total: totalChunks,
      },
    };
  }
  
  // 按顺序合并所有分片
  const chunks: string[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const content = await redis.get(`upload:${sessionId}:chunk:${i}`);
    if (!content) {
      return {
        status: 500,
        data: { error: `分片 ${i} 丢失` },
      };
    }
    chunks.push(content);
  }
  
  const fullText = chunks.join('');
  
  // 保存完整文本
  await redis.set(
    `upload:${sessionId}:text`,
    fullText,
    'EX',
    3600
  );
  
  // 更新状态
  await redis.hset(`upload:${sessionId}`, 'status', 'completed');
  
  // 清理分片 (可选)
  for (let i = 0; i < totalChunks; i++) {
    await redis.del(`upload:${sessionId}:chunk:${i}`);
  }
  
  console.log(`✅ [Upload] 会话 ${sessionId} 上传完成,合并了 ${totalChunks} 片,总长度 ${fullText.length}`);
  
  return {
    success: true,
    textLength: fullText.length,
  };
}
```

#### A3: 修改 Chat API 使用上传会话

```typescript
// api/lambda/chat.ts 修改

export async function post({ data }: RequestOption<any, ChatRequestData>) {
  const {
    message,        // ⚠️ 改为可选
    uploadSessionId, // ✅ 新增: 上传会话 ID
    // ...其他参数
  } = data;
  
  let messageText: string;
  
  // ✅ 支持两种方式: 直接传递文本 or 传递上传会话 ID
  if (uploadSessionId) {
    // 从 Redis 读取已上传的文本
    const text = await redis.get(`upload:${uploadSessionId}:text`);
    if (!text) {
      return {
        status: 404,
        data: { error: '上传会话不存在或已过期' },
      };
    }
    messageText = text;
    console.log(`📦 [Chat] 从上传会话 ${uploadSessionId} 读取文本 (${text.length} 字符)`);
  } else if (message) {
    messageText = message;
  } else {
    return {
      status: 400,
      data: { error: '缺少 message 或 uploadSessionId' },
    };
  }
  
  // 后续处理逻辑不变...
}
```

#### A4: 前端集成

```typescript
// src/hooks/data/useSSEStream.ts 修改

const sendMessage = async (messageText: string, /* ... */) => {
  // ...
  
  // ✅ 如果是超长文本,先分片上传
  let uploadSessionId: string | undefined;
  
  const longTextDetection = isLongText(messageText);
  const needChunkedUpload = messageText.length > 50000; // 超过 50KB
  
  if (needChunkedUpload) {
    updateMessage(assistantMessageId, {
      thinking: '正在上传文本...',
    });
    
    uploadSessionId = await ChunkUploader.uploadWithRetry(
      messageText,
      userId,
      {
        onProgress: (uploaded, total) => {
          updateMessage(assistantMessageId, {
            thinking: `正在上传文本... (${uploaded}/${total} 片)`,
          });
        },
      }
    );
    
    console.log(`✅ [Upload] 文本上传完成,会话 ID: ${uploadSessionId}`);
  }
  
  // ✅ 构建请求
  const requestBody = {
    message: uploadSessionId ? undefined : messageText,
    uploadSessionId: uploadSessionId,
    // ...其他参数
  };
  
  // 发送请求...
};
```

---

### 方案 B: 后端处理容错 (Chunking 断点续传)

#### B1: Redis 保存 Chunking 进度

```typescript
// api/services/chunkingPlanReviewService.ts 修改

export async function handleChunkingPlanReview(
  message: string,
  userId: string,
  conversationId: string,
  clientAssistantMessageId: string | undefined,
  modelType: 'local' | 'volcano',
  sseWriter: SSEStreamWriter,
  options: ChunkingOptions = {},
  resumeFromChunk?: number  // ✅ 新增: 断点续传参数
): Promise<void> {
  console.log('📦 [Chunking] 开始处理超长文本...');
  
  const chunkingId = `chunking:${conversationId}:${clientAssistantMessageId || Date.now()}`;
  
  try {
    // 1. Split：切分文本
    const chunks = splitTextIntoChunks(message, {
      maxChunks: options.maxChunks || 30,
    });
    
    // ✅ 检查是否有保存的进度
    let startIndex = resumeFromChunk || 0;
    let extractedDataList: ExtractedData[] = [];
    
    if (resumeFromChunk && resumeFromChunk > 0) {
      // 从 Redis 恢复已处理的 chunk 数据
      const savedData = await redis.get(`${chunkingId}:progress`);
      if (savedData) {
        const progress = JSON.parse(savedData);
        extractedDataList = progress.extractedDataList || [];
        console.log(`✅ [Chunking] 从第 ${resumeFromChunk} 段恢复处理`);
      }
    }
    
    await sseWriter.sendEvent({
      type: 'chunking_init',
      totalChunks: chunks.length,
      resumedFromChunk: startIndex,
      estimatedSeconds: (chunks.length - startIndex) * 5,
    });
    
    // 2. Map：分析每个 chunk
    for (let i = startIndex; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // 检查流是否已关闭
      if (sseWriter.isClosed()) {
        console.log('⚠️ [Chunking] 客户端已断开，保存进度并停止处理');
        
        // ✅ 保存当前进度到 Redis
        await redis.set(
          `${chunkingId}:progress`,
          JSON.stringify({
            lastProcessedChunk: i - 1,
            extractedDataList,
            chunks: chunks.map(c => ({ index: c.index, startChar: c.startChar, endChar: c.endChar })),
          }),
          'EX',
          3600  // 1 小时过期
        );
        
        return;
      }
      
      await sseWriter.sendEvent({
        type: 'chunking_progress',
        stage: 'map',
        chunkIndex: i,
        totalChunks: chunks.length,
      });
      
      console.log(`🔍 [Chunking] 分析第 ${i + 1}/${chunks.length} 段...`);
      
      // 调用模型分析这个 chunk (增加重试机制)
      const chunkData = await processChunkWithRetry(chunk, i, chunks.length, 3);
      extractedDataList.push(chunkData);
      
      await sseWriter.sendEvent({
        type: 'chunking_chunk',
        chunkIndex: i,
        chunkSummary: chunkData.goals.join('; '),
      });
      
      // ✅ 每处理 5 个 chunk 保存一次进度
      if ((i + 1) % 5 === 0) {
        await redis.set(
          `${chunkingId}:progress`,
          JSON.stringify({
            lastProcessedChunk: i,
            extractedDataList,
            chunks: chunks.map(c => ({ index: c.index, startChar: c.startChar, endChar: c.endChar })),
          }),
          'EX',
          3600
        );
        console.log(`💾 [Chunking] 已保存进度 (${i + 1}/${chunks.length})`);
      }
    }
    
    // 3. Reduce：合并数据
    await sseWriter.sendEvent({
      type: 'chunking_progress',
      stage: 'reduce',
    });
    
    console.log('🔄 [Chunking] 合并分析结果...');
    const mergedData = mergeExtractedData(extractedDataList);
    
    // ... 后续流程不变
    
    // ✅ 完成后清理 Redis 进度
    await redis.del(`${chunkingId}:progress`);
    
  } catch (error: any) {
    console.error('❌ [Chunking] 处理失败:', error);
    throw error;
  }
}

/**
 * ✅ 新增: 带重试的 chunk 处理
 */
async function processChunkWithRetry(
  chunk: TextChunk,
  chunkIndex: number,
  totalChunks: number,
  maxRetries: number = 3
): Promise<ExtractedData> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await processChunk(chunk, chunkIndex, totalChunks);
    } catch (error) {
      console.warn(`⚠️ [Chunking] Chunk ${chunkIndex} 处理失败 (尝试 ${attempt + 1}/${maxRetries})`, error);
      
      if (attempt === maxRetries - 1) {
        // 最后一次失败,返回空数据
        return {
          goals: [],
          milestones: [],
          tasks: [],
          metrics: [],
          risks: [],
          unknowns: [],
        };
      }
      
      // 指数退避
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
  
  // TypeScript 类型检查
  return {
    goals: [],
    milestones: [],
    tasks: [],
    metrics: [],
    risks: [],
    unknowns: [],
  };
}
```

#### B2: Chat API 支持 Chunking 断点续传

```typescript
// api/lambda/chat.ts 修改

export async function post({ data }: RequestOption<any, ChatRequestData>) {
  const {
    resumeChunkingFromChunk,  // ✅ 新增: Chunking 断点续传参数
    // ...
  } = data;
  
  // ...
  
  if (shouldUseChunking) {
    console.log('📦 [Chunking] 启动超长文本智能分段处理...');
    
    // ...
    
    // 执行 chunking 处理
    await handleChunkingPlanReview(
      messageText,
      userId,
      conversationId,
      clientAssistantMessageId,
      modelType,
      sseWriter,
      longTextOptions,
      resumeChunkingFromChunk  // ✅ 传递断点续传参数
    );
    
    // ...
  }
}
```

#### B3: 前端重连时尝试断点续传

```typescript
// src/hooks/data/useSSEStream.ts 修改

export function useSSEStream(options: UseSSEStreamOptions = {}) {
  // ✅ 新增: 记录最后完成的 chunk
  const [lastCompletedChunk, setLastCompletedChunk] = useState<number | null>(null);
  
  const sendMessage = async (messageText: string, /* ... */) => {
    // ...
    
    const runStreamOnce = async (): Promise<{ completed: boolean; aborted: boolean; retryAfterMs?: number }> => {
      // ...
      
      const requestBody = {
        // ...
        // ✅ 如果是 chunking 模式且有已完成的 chunk,传递续传参数
        ...(longTextMode !== 'off' && lastCompletedChunk !== null ? {
          resumeChunkingFromChunk: lastCompletedChunk + 1
        } : {}),
      };
      
      // ...
      
      // 解析 SSE 事件
      const eventData = JSON.parse(line.slice(5).trim());
      
      // ✅ 记录 chunking 进度
      if (eventData.type === 'chunking_chunk') {
        setLastCompletedChunk(eventData.chunkIndex);
      }
      
      // ✅ chunking 初始化事件 (可能是断点续传)
      if (eventData.type === 'chunking_init') {
        if (eventData.resumedFromChunk > 0) {
          updateMessage(assistantMessageId, {
            thinking: `从第 ${eventData.resumedFromChunk} 段继续处理...`,
          });
        }
      }
      
      // ...
    };
    
    // 断线重连循环
    let attempt = 0;
    while (true) {
      const result = await runStreamOnce();
      if (result.completed) {
        // ✅ 完成后重置
        setLastCompletedChunk(null);
        break;
      }
      
      // ...重连逻辑
    }
  };
  
  // ...
}
```

---

## 📊 方案对比

| 方案 | 优点 | 缺点 | 实施难度 | 推荐度 |
|------|------|------|----------|--------|
| **A: 前端分片上传** | • 解决上传过程网络问题<br>• 支持断点续传<br>• 大文件友好 | • 需要新增 3 个 API<br>• 需要 Redis 存储<br>• 增加前端复杂度 | ⭐⭐⭐⭐ | ⭐⭐⭐ (可选) |
| **B: 后端处理容错** | • 节省重复处理时间<br>• 节省 API 调用成本<br>• 用户体验更好 | • 需要 Redis 存储进度<br>• 需要设计过期策略 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ (强烈推荐) |

---

## 🎯 推荐实施策略

### 阶段 1: 立即实施 (高优先级)

✅ **实施方案 B (后端处理容错)**

**原因**:
1. **成本问题**: 30 个 chunk,每个调用模型 API,如果 SSE 中断重连,会浪费大量 API 调用
2. **时间问题**: 重新处理 30 个 chunk 可能需要 150 秒 (5 秒/chunk),用户体验很差
3. **实施简单**: 只需要修改现有代码,不需要新增 API

**实施步骤**:
1. 在 `chunkingPlanReviewService.ts` 中添加进度保存逻辑
2. 在 `chat.ts` 中添加 `resumeChunkingFromChunk` 参数
3. 在 `useSSEStream.ts` 中添加重连续传逻辑
4. 测试断点续传功能

### 阶段 2: 可选实施 (中等优先级)

⚠️ **实施方案 A (前端分片上传)**

**何时需要**:
- 用户经常上传超大文本 (>100KB)
- 用户网络环境不佳 (移动网络)
- 监控数据显示上传失败率高

**何时不需要**:
- 大部分文本 <50KB (上传通常 <500ms)
- 用户网络环境良好
- HTTP 请求失败率很低

---

## 🧪 测试验证

### 测试场景 1: 模拟 SSE 中断

```javascript
// test/test-chunking-resume.js

async function testChunkingResume() {
  console.log('🧪 测试 Chunking 断点续传');
  
  const longText = generateLongPlanText(); // 生成超长文本
  
  // 第一次请求 (模拟中途中断)
  const controller1 = new AbortController();
  
  setTimeout(() => {
    console.log('⚠️ 模拟中断 (5 秒后)');
    controller1.abort();
  }, 5000);
  
  let lastChunk = 0;
  
  try {
    const response1 = await fetch('http://localhost:8080/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: longText,
        modelType: 'volcano',
        userId: 'test-user',
        mode: 'single',
        longTextMode: 'plan_review',
        clientAssistantMessageId: 'test-msg-123',
      }),
      signal: controller1.signal,
    });
    
    // 读取流直到中断
    const reader = response1.body;
    reader.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = JSON.parse(line.slice(5));
          if (data.type === 'chunking_chunk') {
            lastChunk = data.chunkIndex;
            console.log(`✅ 完成第 ${lastChunk + 1} 段`);
          }
        }
      }
    });
  } catch (error) {
    console.log(`⚠️ 第一次请求中断,已完成 ${lastChunk + 1} 段`);
  }
  
  // 第二次请求 (断点续传)
  console.log(`\n🔄 尝试从第 ${lastChunk + 1} 段继续...`);
  
  const response2 = await fetch('http://localhost:8080/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: longText,
      modelType: 'volcano',
      userId: 'test-user',
      mode: 'single',
      longTextMode: 'plan_review',
      clientAssistantMessageId: 'test-msg-123',
      resumeChunkingFromChunk: lastChunk + 1,  // ✅ 断点续传
    }),
  });
  
  // 验证是否从正确的位置继续
  const reader2 = response2.body;
  reader2.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (line.startsWith('data:')) {
        const data = JSON.parse(line.slice(5));
        if (data.type === 'chunking_init' && data.resumedFromChunk) {
          console.log(`✅ 成功续传! 从第 ${data.resumedFromChunk} 段开始`);
        }
      }
    }
  });
}

testChunkingResume();
```

### 测试场景 2: 模拟单个 Chunk 网络失败

```javascript
// test/test-chunk-retry.js

// 在 processChunk 中添加模拟失败
async function processChunk(chunk, chunkIndex, totalChunks) {
  // 🧪 测试: 第 5 个 chunk 模拟失败
  if (process.env.TEST_MODE === 'true' && chunkIndex === 4) {
    console.log('🧪 [Test] 模拟第 5 个 chunk 网络失败');
    throw new Error('模拟网络错误');
  }
  
  // 正常处理...
}
```

---

## 📚 相关文档

- [超长文本智能分段处理指南](./LONG_TEXT_CHUNKING_GUIDE.md)
- [SSE 连接守护](./SSE_CONNECTION_GUARD.md)
- [多 Agent 断点续传](./STREAMING_MULTI_AGENT_GUIDE.md)
- [Redis 配置](./REDIS_SETUP.md)

---

## 🎯 总结

### 核心问题

1. ⚠️ **前端上传不存在分片** - 是一次性 HTTP POST
2. ✅ **后端处理存在分片** - 但缺少断点续传机制

### 解决方案优先级

1. **立即实施**: 方案 B (后端 Chunking 断点续传) - 节省成本,提升体验
2. **可选实施**: 方案 A (前端分片上传) - 只有在大文件上传失败率高时才需要

### 关键技术点

- ✅ Redis 保存处理进度
- ✅ 每 N 个 chunk 自动保存
- ✅ SSE 断连时保存最新进度
- ✅ 重连时传递 `resumeFromChunk` 参数
- ✅ 单个 chunk 失败自动重试 (3 次)
- ✅ 前端显示续传进度

---

**作者**: AI Assistant  
**日期**: 2024-12-30  
**版本**: 1.0.0

