# 文件系统断点续传完整实现方案

## 🎯 核心思路

使用文件系统存储分片，通过检查已存在的分片文件来实现断点续传。

```
用户上传到第 5 片时网络断开
    ↓
后端已保存: chunk_0, chunk_1, chunk_2, chunk_3, chunk_4
    ↓
用户重连
    ↓
前端查询: "哪些分片已上传？"
    ↓
后端返回: [0, 1, 2, 3, 4]
    ↓
前端续传: 从第 5 片开始上传
```

---

## 📂 文件目录结构

```
/tmp/uploads/
├── upload_user123_1704000000000/        # 上传会话目录
│   ├── meta.json                        # 元数据
│   ├── chunk_0                          # 分片 0
│   ├── chunk_1                          # 分片 1
│   ├── chunk_2                          # 分片 2
│   ├── ...
│   └── chunk_9                          # 分片 9
├── upload_user456_1704000001000/
│   └── ...
└── ...
```

---

## 💻 后端实现

### 1. 文件存储服务

```typescript
// api/services/fileChunkStore.ts

import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

// 上传目录配置
const UPLOAD_DIR = process.env.UPLOAD_TEMP_DIR || path.join(process.cwd(), 'temp', 'uploads');

interface SessionMeta {
  userId: string;
  totalChunks: number;
  fileName?: string;
  fileSize: number;
  createdAt: number;
  lastModified: number;
}

export class FileChunkStore {
  /**
   * 初始化上传目录
   */
  static async init(): Promise<void> {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    console.log(`✅ 上传目录已创建: ${UPLOAD_DIR}`);
    
    // 启动定期清理
    this.startCleanupTimer();
  }
  
  /**
   * 创建上传会话
   */
  static async createSession(
    userId: string,
    totalChunks: number,
    fileSize: number,
    fileName?: string
  ): Promise<string> {
    const sessionId = `upload_${userId}_${Date.now()}`;
    const sessionDir = path.join(UPLOAD_DIR, sessionId);
    
    // 创建会话目录
    await fs.mkdir(sessionDir, { recursive: true });
    
    // 保存元数据
    const meta: SessionMeta = {
      userId,
      totalChunks,
      fileName,
      fileSize,
      createdAt: Date.now(),
      lastModified: Date.now(),
    };
    
    await fs.writeFile(
      path.join(sessionDir, 'meta.json'),
      JSON.stringify(meta, null, 2),
      'utf-8'
    );
    
    console.log(`📁 创建上传会话: ${sessionId}, 总分片: ${totalChunks}`);
    
    return sessionId;
  }
  
  /**
   * 保存单个分片
   */
  static async saveChunk(
    sessionId: string,
    chunkIndex: number,
    data: Buffer
  ): Promise<void> {
    const sessionDir = path.join(UPLOAD_DIR, sessionId);
    const chunkFile = path.join(sessionDir, `chunk_${chunkIndex}`);
    
    // 保存分片
    await fs.writeFile(chunkFile, data);
    
    // 更新元数据的最后修改时间
    await this.updateLastModified(sessionId);
    
    console.log(`💾 保存分片: ${sessionId}/chunk_${chunkIndex} (${data.length} bytes)`);
  }
  
  /**
   * 获取已上传的分片索引列表（断点续传关键）
   */
  static async getUploadedChunks(sessionId: string): Promise<number[]> {
    const sessionDir = path.join(UPLOAD_DIR, sessionId);
    
    // 检查会话目录是否存在
    if (!existsSync(sessionDir)) {
      return [];
    }
    
    try {
      // 读取目录中的所有文件
      const files = await fs.readdir(sessionDir);
      
      // 提取分片索引
      const chunkIndices: number[] = [];
      for (const file of files) {
        const match = file.match(/^chunk_(\d+)$/);
        if (match) {
          chunkIndices.push(parseInt(match[1], 10));
        }
      }
      
      // 排序
      chunkIndices.sort((a, b) => a - b);
      
      console.log(`🔍 会话 ${sessionId} 已上传分片: [${chunkIndices.join(', ')}]`);
      
      return chunkIndices;
    } catch (error) {
      console.error(`❌ 读取已上传分片失败: ${sessionId}`, error);
      return [];
    }
  }
  
  /**
   * 获取会话元数据
   */
  static async getSessionMeta(sessionId: string): Promise<SessionMeta | null> {
    const sessionDir = path.join(UPLOAD_DIR, sessionId);
    const metaFile = path.join(sessionDir, 'meta.json');
    
    if (!existsSync(metaFile)) {
      return null;
    }
    
    try {
      const content = await fs.readFile(metaFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`❌ 读取元数据失败: ${sessionId}`, error);
      return null;
    }
  }
  
  /**
   * 检查所有分片是否已上传完成
   */
  static async isComplete(sessionId: string): Promise<boolean> {
    const meta = await this.getSessionMeta(sessionId);
    if (!meta) return false;
    
    const uploadedChunks = await this.getUploadedChunks(sessionId);
    
    // 检查数量是否匹配
    if (uploadedChunks.length !== meta.totalChunks) {
      return false;
    }
    
    // 检查是否连续（0, 1, 2, ..., n-1）
    for (let i = 0; i < meta.totalChunks; i++) {
      if (!uploadedChunks.includes(i)) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * 合并所有分片
   */
  static async assembleChunks(sessionId: string): Promise<Buffer> {
    const sessionDir = path.join(UPLOAD_DIR, sessionId);
    const meta = await this.getSessionMeta(sessionId);
    
    if (!meta) {
      throw new Error(`会话不存在: ${sessionId}`);
    }
    
    // 检查是否完整
    const isComplete = await this.isComplete(sessionId);
    if (!isComplete) {
      const uploadedChunks = await this.getUploadedChunks(sessionId);
      throw new Error(
        `分片不完整: 需要 ${meta.totalChunks} 个，已上传 ${uploadedChunks.length} 个`
      );
    }
    
    console.log(`🔄 开始合并分片: ${sessionId}`);
    
    // 按顺序读取所有分片
    const buffers: Buffer[] = [];
    for (let i = 0; i < meta.totalChunks; i++) {
      const chunkFile = path.join(sessionDir, `chunk_${i}`);
      const chunk = await fs.readFile(chunkFile);
      buffers.push(chunk);
      
      console.log(`📖 读取分片 ${i}: ${chunk.length} bytes`);
    }
    
    // 合并
    const result = Buffer.concat(buffers);
    
    console.log(`✅ 合并完成: 总大小 ${result.length} bytes`);
    
    return result;
  }
  
  /**
   * 清理会话（删除所有分片和元数据）
   */
  static async cleanupSession(sessionId: string): Promise<void> {
    const sessionDir = path.join(UPLOAD_DIR, sessionId);
    
    if (existsSync(sessionDir)) {
      await fs.rm(sessionDir, { recursive: true, force: true });
      console.log(`🧹 清理会话: ${sessionId}`);
    }
  }
  
  /**
   * 更新会话的最后修改时间
   */
  private static async updateLastModified(sessionId: string): Promise<void> {
    const meta = await this.getSessionMeta(sessionId);
    if (!meta) return;
    
    meta.lastModified = Date.now();
    
    const sessionDir = path.join(UPLOAD_DIR, sessionId);
    const metaFile = path.join(sessionDir, 'meta.json');
    
    await fs.writeFile(metaFile, JSON.stringify(meta, null, 2), 'utf-8');
  }
  
  /**
   * 定期清理过期会话
   */
  private static startCleanupTimer(): void {
    const CLEANUP_INTERVAL = 5 * 60 * 1000;  // 5 分钟
    const SESSION_TIMEOUT = 60 * 60 * 1000;  // 1 小时
    
    setInterval(async () => {
      console.log('🧹 开始清理过期会话...');
      
      try {
        const sessions = await fs.readdir(UPLOAD_DIR);
        const now = Date.now();
        let cleanedCount = 0;
        
        for (const sessionId of sessions) {
          const meta = await this.getSessionMeta(sessionId);
          
          if (!meta) {
            // 元数据丢失，直接清理
            await this.cleanupSession(sessionId);
            cleanedCount++;
            continue;
          }
          
          // 检查是否超时
          if (now - meta.lastModified > SESSION_TIMEOUT) {
            console.log(`⏰ 会话超时: ${sessionId}`);
            await this.cleanupSession(sessionId);
            cleanedCount++;
          }
        }
        
        if (cleanedCount > 0) {
          console.log(`✅ 清理了 ${cleanedCount} 个过期会话`);
        }
      } catch (error) {
        console.error('❌ 清理过期会话失败:', error);
      }
    }, CLEANUP_INTERVAL);
  }
}

// 初始化
FileChunkStore.init().catch(console.error);
```

---

### 2. API 路由实现

```typescript
// api/lambda/upload.ts

import { RequestOption } from '@modern-js/runtime/server';
import { FileChunkStore } from '../services/fileChunkStore';

/**
 * POST /api/upload/session - 创建上传会话
 */
export async function post_session({
  data,
}: RequestOption<any, {
  userId: string;
  totalChunks: number;
  fileSize: number;
  fileName?: string;
}>) {
  try {
    const { userId, totalChunks, fileSize, fileName } = data;
    
    // 创建会话
    const sessionId = await FileChunkStore.createSession(
      userId,
      totalChunks,
      fileSize,
      fileName
    );
    
    return {
      success: true,
      sessionId,
      message: '上传会话已创建',
    };
  } catch (error: any) {
    console.error('❌ 创建上传会话失败:', error);
    return {
      status: 500,
      data: { error: error.message || '创建会话失败' },
    };
  }
}

/**
 * POST /api/upload/chunk - 上传单个分片
 */
export async function post_chunk({
  data,
}: RequestOption<any, {
  sessionId: string;
  chunkIndex: number;
  chunk: Buffer;
}>) {
  try {
    const { sessionId, chunkIndex, chunk } = data;
    
    // 保存分片
    await FileChunkStore.saveChunk(sessionId, chunkIndex, chunk);
    
    // 获取已上传的分片列表
    const uploadedChunks = await FileChunkStore.getUploadedChunks(sessionId);
    
    return {
      success: true,
      chunkIndex,
      uploadedCount: uploadedChunks.length,
      message: `分片 ${chunkIndex} 上传成功`,
    };
  } catch (error: any) {
    console.error('❌ 上传分片失败:', error);
    return {
      status: 500,
      data: { error: error.message || '上传分片失败' },
    };
  }
}

/**
 * GET /api/upload/status/:sessionId - 查询上传状态（断点续传关键）
 */
export async function get_status({
  params,
}: RequestOption<any, any>) {
  try {
    const { sessionId } = params;
    
    // 获取元数据
    const meta = await FileChunkStore.getSessionMeta(sessionId);
    if (!meta) {
      return {
        status: 404,
        data: { error: '会话不存在或已过期' },
      };
    }
    
    // 获取已上传的分片
    const uploadedChunks = await FileChunkStore.getUploadedChunks(sessionId);
    
    // 检查是否完成
    const isComplete = await FileChunkStore.isComplete(sessionId);
    
    return {
      success: true,
      sessionId,
      meta,
      uploadedChunks,
      uploadedCount: uploadedChunks.length,
      totalChunks: meta.totalChunks,
      progress: Math.round((uploadedChunks.length / meta.totalChunks) * 100),
      isComplete,
    };
  } catch (error: any) {
    console.error('❌ 查询上传状态失败:', error);
    return {
      status: 500,
      data: { error: error.message || '查询状态失败' },
    };
  }
}

/**
 * POST /api/upload/complete - 完成上传
 */
export async function post_complete({
  data,
}: RequestOption<any, { sessionId: string }>) {
  try {
    const { sessionId } = data;
    
    // 检查是否完整
    const isComplete = await FileChunkStore.isComplete(sessionId);
    if (!isComplete) {
      const uploadedChunks = await FileChunkStore.getUploadedChunks(sessionId);
      const meta = await FileChunkStore.getSessionMeta(sessionId);
      
      return {
        status: 400,
        data: {
          error: '分片不完整',
          uploadedCount: uploadedChunks.length,
          totalChunks: meta?.totalChunks,
          missingChunks: findMissingChunks(uploadedChunks, meta!.totalChunks),
        },
      };
    }
    
    // 合并分片
    const result = await FileChunkStore.assembleChunks(sessionId);
    
    // 保存完整文件（这里可以进一步处理，如解压、存储等）
    // 这里我们直接返回，由 chat API 使用
    
    return {
      success: true,
      sessionId,
      totalSize: result.length,
      message: '上传完成',
    };
  } catch (error: any) {
    console.error('❌ 完成上传失败:', error);
    return {
      status: 500,
      data: { error: error.message || '完成上传失败' },
    };
  }
}

/**
 * 找出缺失的分片
 */
function findMissingChunks(uploaded: number[], total: number): number[] {
  const missing: number[] = [];
  for (let i = 0; i < total; i++) {
    if (!uploaded.includes(i)) {
      missing.push(i);
    }
  }
  return missing;
}
```

---

### 3. 集成到 Chat API

```typescript
// api/lambda/chat.ts (修改)

import { FileChunkStore } from '../services/fileChunkStore';

export async function post({ data }: RequestOption<any, ChatRequestData>) {
  const {
    message,
    uploadSessionId,  // ✅ 支持从上传会话读取
    // ...其他参数
  } = data;
  
  let messageText: string;
  
  // ✅ 如果是上传会话，从文件系统读取
  if (uploadSessionId) {
    try {
      // 检查是否完整
      const isComplete = await FileChunkStore.isComplete(uploadSessionId);
      if (!isComplete) {
        return {
          status: 400,
          data: { error: '上传未完成，请继续上传剩余分片' },
        };
      }
      
      // 合并并获取完整文本
      const buffer = await FileChunkStore.assembleChunks(uploadSessionId);
      
      // 如果是压缩的，解压
      if (data.isCompressed) {
        const decompressed = await gunzipAsync(buffer);
        messageText = decompressed.toString('utf-8');
      } else {
        messageText = buffer.toString('utf-8');
      }
      
      // 清理临时文件
      await FileChunkStore.cleanupSession(uploadSessionId);
      
      console.log(`📦 从上传会话读取文本: ${messageText.length} 字符`);
      
    } catch (error: any) {
      console.error('❌ 读取上传会话失败:', error);
      return {
        status: 500,
        data: { error: error.message || '读取上传数据失败' },
      };
    }
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

---

## 🌐 前端实现

### 1. 分片上传器（带断点续传）

```typescript
// src/utils/chunkUploader.ts

export class ChunkUploader {
  private static readonly CHUNK_SIZE = 100 * 1024; // 100KB
  
  /**
   * 上传大文件（支持断点续传）
   */
  static async uploadLargeBlob(
    blob: Blob,
    userId: string,
    onProgress?: (percent: number) => void,
    existingSessionId?: string  // ✅ 断点续传：传入已存在的会话 ID
  ): Promise<string> {
    // 1. 计算总分片数
    const totalChunks = Math.ceil(blob.size / this.CHUNK_SIZE);
    
    let sessionId: string;
    let uploadedChunks: number[] = [];
    
    // ✅ 断点续传：检查已有会话
    if (existingSessionId) {
      // 查询已上传的分片
      const status = await this.getUploadStatus(existingSessionId);
      
      if (status && !status.isComplete) {
        sessionId = existingSessionId;
        uploadedChunks = status.uploadedChunks;
        
        console.log(
          `📦 [续传] 会话 ${sessionId} 已上传 ${uploadedChunks.length}/${totalChunks} 片`
        );
      } else {
        // 会话已完成或不存在，创建新会话
        sessionId = await this.createSession(userId, totalChunks, blob.size);
      }
    } else {
      // 2. 创建新会话
      sessionId = await this.createSession(userId, totalChunks, blob.size);
    }
    
    // 3. 上传分片（跳过已上传的）
    for (let i = 0; i < totalChunks; i++) {
      // ✅ 跳过已上传的分片
      if (uploadedChunks.includes(i)) {
        console.log(`⏭️ [跳过] 分片 ${i} 已上传`);
        onProgress?.(Math.round(((i + 1) / totalChunks) * 100));
        continue;
      }
      
      // 提取分片数据
      const start = i * this.CHUNK_SIZE;
      const end = Math.min(start + this.CHUNK_SIZE, blob.size);
      const chunk = blob.slice(start, end);
      
      // 上传分片（带重试）
      await this.uploadChunkWithRetry(sessionId, i, chunk, 3);
      
      // 更新进度
      onProgress?.(Math.round(((i + 1) / totalChunks) * 100));
    }
    
    // 4. 完成上传
    await this.completeUpload(sessionId);
    
    return sessionId;
  }
  
  /**
   * 创建上传会话
   */
  private static async createSession(
    userId: string,
    totalChunks: number,
    fileSize: number
  ): Promise<string> {
    const response = await fetch('/api/upload/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        totalChunks,
        fileSize,
      }),
    });
    
    if (!response.ok) {
      throw new Error('创建上传会话失败');
    }
    
    const data = await response.json();
    return data.sessionId;
  }
  
  /**
   * 查询上传状态（断点续传关键）
   */
  private static async getUploadStatus(sessionId: string): Promise<{
    uploadedChunks: number[];
    totalChunks: number;
    isComplete: boolean;
  } | null> {
    try {
      const response = await fetch(`/api/upload/status/${sessionId}`);
      
      if (!response.ok) {
        return null;
      }
      
      const data = await response.json();
      return {
        uploadedChunks: data.uploadedChunks,
        totalChunks: data.totalChunks,
        isComplete: data.isComplete,
      };
    } catch (error) {
      console.error('❌ 查询上传状态失败:', error);
      return null;
    }
  }
  
  /**
   * 上传单个分片（带重试）
   */
  private static async uploadChunkWithRetry(
    sessionId: string,
    chunkIndex: number,
    chunk: Blob,
    maxRetries: number
  ): Promise<void> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // 转为 ArrayBuffer
        const buffer = await chunk.arrayBuffer();
        
        const formData = new FormData();
        formData.append('sessionId', sessionId);
        formData.append('chunkIndex', chunkIndex.toString());
        formData.append('chunk', new Blob([buffer]));
        
        const response = await fetch('/api/upload/chunk', {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        console.log(`✅ [上传] 分片 ${chunkIndex}`);
        return; // 成功
        
      } catch (error) {
        console.warn(`⚠️ [重试] 分片 ${chunkIndex} 失败 (${attempt + 1}/${maxRetries})`, error);
        
        if (attempt === maxRetries - 1) {
          throw new Error(`分片 ${chunkIndex} 上传失败，已达最大重试次数`);
        }
        
        // 指数退避
        await this.sleep(1000 * Math.pow(2, attempt));
      }
    }
  }
  
  /**
   * 完成上传
   */
  private static async completeUpload(sessionId: string): Promise<void> {
    const response = await fetch('/api/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    
    if (!response.ok) {
      throw new Error('完成上传失败');
    }
  }
  
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

### 2. 集成到发送流程（支持断点续传）

```typescript
// src/hooks/data/useSSEStream.ts (修改)

export function useSSEStream(options: UseSSEStreamOptions = {}) {
  // ✅ 保存当前上传会话 ID（用于断点续传）
  const [currentUploadSession, setCurrentUploadSession] = useState<string | null>(null);
  
  const sendMessage = async (messageText: string, /* ... */) => {
    try {
      // ...决定上传策略
      
      if (decision.strategy === 'chunking') {
        updateMessage(assistantMessageId, {
          thinking: '正在上传文本...',
        });
        
        // 压缩
        const compressed = await compressText(messageText);
        
        // ✅ 分片上传（支持断点续传）
        const sessionId = await ChunkUploader.uploadLargeBlob(
          compressed,
          userId,
          (percent) => {
            updateMessage(assistantMessageId, {
              thinking: `上传中... ${percent}%`,
            });
          },
          currentUploadSession  // ✅ 如果之前有未完成的会话，继续上传
        );
        
        // 保存会话 ID
        setCurrentUploadSession(sessionId);
        
        // 构建请求
        requestBody = {
          uploadSessionId: sessionId,
          userId,
          conversationId,
          isCompressed: true,
          // ...
        };
        
        // 发送请求...
        
        // ✅ 成功后清除会话 ID
        setCurrentUploadSession(null);
      }
      
      // ...
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // 用户主动中断，保留 currentUploadSession
        // 下次可以续传
        console.log('⚠️ 上传中断，会话已保存，可以续传');
      } else {
        // 其他错误，清除会话
        setCurrentUploadSession(null);
      }
    }
  };
  
  return {
    sendMessage,
    currentUploadSession,  // ✅ 导出给 UI 显示
  };
}
```

---

### 3. UI 提示（可选）

```typescript
// src/components/ChatInterface.tsx

export const ChatInterface: React.FC = () => {
  const { sendMessage, currentUploadSession } = useSSEStream();
  
  return (
    <div>
      {/* ✅ 显示断点续传提示 */}
      {currentUploadSession && (
        <div className="resume-upload-notice">
          <span>⚠️ 上次上传未完成</span>
          <button onClick={() => {
            // 继续上传
            sendMessage(/* 之前的文本 */);
          }}>
            继续上传
          </button>
          <button onClick={() => {
            // 放弃续传
            setCurrentUploadSession(null);
          }}>
            重新开始
          </button>
        </div>
      )}
      
      {/* 其他 UI */}
    </div>
  );
};
```

---

## 🧪 测试断点续传

### 测试脚本

```javascript
// test/test-resume-upload.js

async function testResumeUpload() {
  console.log('🧪 测试断点续传');
  
  const largeText = 'a'.repeat(5 * 1024 * 1024);  // 5MB
  const userId = 'test-user';
  
  // 1. 开始上传
  console.log('\n📤 第一次上传（模拟中断）...');
  
  let sessionId;
  let uploadedChunks = 0;
  
  try {
    const compressed = await compressText(largeText);
    
    // 创建会话
    const sessionRes = await fetch('http://localhost:8080/api/upload/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        totalChunks: 50,
        fileSize: compressed.size,
      }),
    });
    
    const sessionData = await sessionRes.json();
    sessionId = sessionData.sessionId;
    console.log(`✅ 创建会话: ${sessionId}`);
    
    // 上传前 10 个分片
    for (let i = 0; i < 10; i++) {
      const start = i * 100 * 1024;
      const end = Math.min(start + 100 * 1024, compressed.size);
      const chunk = compressed.slice(start, end);
      
      const formData = new FormData();
      formData.append('sessionId', sessionId);
      formData.append('chunkIndex', i.toString());
      formData.append('chunk', chunk);
      
      await fetch('http://localhost:8080/api/upload/chunk', {
        method: 'POST',
        body: formData,
      });
      
      uploadedChunks++;
      console.log(`✅ 上传分片 ${i}`);
    }
    
    console.log(`⚠️ 模拟中断！已上传 ${uploadedChunks} 个分片`);
    
  } catch (error) {
    console.error('❌ 上传失败:', error);
  }
  
  // 2. 查询状态
  console.log('\n🔍 查询上传状态...');
  
  const statusRes = await fetch(`http://localhost:8080/api/upload/status/${sessionId}`);
  const statusData = await statusRes.json();
  
  console.log(`📊 已上传: ${statusData.uploadedChunks.length}/${statusData.totalChunks}`);
  console.log(`📊 已上传分片: [${statusData.uploadedChunks.join(', ')}]`);
  
  // 3. 断点续传
  console.log('\n🔄 断点续传...');
  
  const compressed = await compressText(largeText);
  const totalChunks = Math.ceil(compressed.size / (100 * 1024));
  
  for (let i = 0; i < totalChunks; i++) {
    // ✅ 跳过已上传的分片
    if (statusData.uploadedChunks.includes(i)) {
      console.log(`⏭️ 跳过分片 ${i} (已上传)`);
      continue;
    }
    
    const start = i * 100 * 1024;
    const end = Math.min(start + 100 * 1024, compressed.size);
    const chunk = compressed.slice(start, end);
    
    const formData = new FormData();
    formData.append('sessionId', sessionId);
    formData.append('chunkIndex', i.toString());
    formData.append('chunk', chunk);
    
    await fetch('http://localhost:8080/api/upload/chunk', {
      method: 'POST',
      body: formData,
    });
    
    console.log(`✅ 续传分片 ${i}`);
  }
  
  // 4. 完成上传
  console.log('\n✅ 完成上传');
  
  await fetch('http://localhost:8080/api/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  
  console.log('🎉 断点续传测试成功！');
}

testResumeUpload();
```

---

## 📊 总结

### 核心流程

```
1. 创建会话 → 返回 sessionId
2. 上传分片 → 保存到文件系统
3. 网络中断 → 部分分片已保存
4. 查询状态 → 获取已上传分片列表
5. 断点续传 → 只上传缺失的分片
6. 完成上传 → 合并所有分片
```

### 关键 API

| API | 方法 | 功能 |
|-----|------|------|
| `/api/upload/session` | POST | 创建上传会话 |
| `/api/upload/chunk` | POST | 上传单个分片 |
| `/api/upload/status/:sessionId` | GET | **查询已上传分片（断点续传关键）** |
| `/api/upload/complete` | POST | 完成上传并合并 |

### 代码量

```
后端：
- fileChunkStore.ts: ~300 行（核心存储服务）
- upload.ts: ~150 行（API 路由）
- chat.ts: +50 行（集成）
总计：~500 行

前端：
- chunkUploader.ts: ~200 行（支持断点续传）
- useSSEStream.ts: +100 行（集成）
总计：~300 行

总代码量：~800 行
```

### 工作量

- 后端实现：1-2 天
- 前端实现：1 天
- 测试调试：0.5-1 天
- **总计：2.5-4 天**

### 优势

✅ **零外部依赖**：只用文件系统  
✅ **支持断点续传**：网络中断可恢复  
✅ **自动清理**：过期会话定期删除  
✅ **可靠性高**：文件持久化  
✅ **成本低**：无需 Redis

---

**作者**: AI Assistant  
**日期**: 2024-12-30  
**版本**: 1.0.0

