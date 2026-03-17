# 分片上传的存储方案对比

## 🤔 核心问题

**分片上传是否一定需要 Redis？**

答案：**不一定！** 有多种实现方案，各有优劣。

---

## 📊 存储方案对比

### 方案 1: 内存存储（最简单）

#### 实现原理

```typescript
// api/services/chunkBuffer.ts

// 使用 Map 存储分片
const chunkSessions = new Map<string, {
  userId: string;
  totalChunks: number;
  chunks: Map<number, Buffer>;  // chunkIndex -> Buffer
  createdAt: number;
}>();

/**
 * 创建上传会话
 */
export function createSession(userId: string, totalChunks: number): string {
  const sessionId = `upload_${userId}_${Date.now()}`;
  
  chunkSessions.set(sessionId, {
    userId,
    totalChunks,
    chunks: new Map(),
    createdAt: Date.now(),
  });
  
  return sessionId;
}

/**
 * 保存分片
 */
export function saveChunk(sessionId: string, chunkIndex: number, data: Buffer): void {
  const session = chunkSessions.get(sessionId);
  if (!session) {
    throw new Error('会话不存在');
  }
  
  session.chunks.set(chunkIndex, data);
}

/**
 * 获取完整数据
 */
export function assembleChunks(sessionId: string): Buffer {
  const session = chunkSessions.get(sessionId);
  if (!session) {
    throw new Error('会话不存在');
  }
  
  // 检查是否所有分片都已上传
  if (session.chunks.size !== session.totalChunks) {
    throw new Error('部分分片未上传');
  }
  
  // 按顺序合并
  const buffers: Buffer[] = [];
  for (let i = 0; i < session.totalChunks; i++) {
    const chunk = session.chunks.get(i);
    if (!chunk) {
      throw new Error(`分片 ${i} 缺失`);
    }
    buffers.push(chunk);
  }
  
  // 清理会话
  chunkSessions.delete(sessionId);
  
  return Buffer.concat(buffers);
}

/**
 * 定期清理过期会话
 */
setInterval(() => {
  const now = Date.now();
  const timeout = 60 * 60 * 1000;  // 1 小时
  
  for (const [sessionId, session] of chunkSessions.entries()) {
    if (now - session.createdAt > timeout) {
      chunkSessions.delete(sessionId);
      console.log(`🧹 清理过期会话: ${sessionId}`);
    }
  }
}, 5 * 60 * 1000);  // 每 5 分钟清理一次
```

#### 优点

✅ **极简单**：不需要任何外部依赖  
✅ **性能高**：纯内存操作，速度快  
✅ **零成本**：不需要额外基础设施  
✅ **开发快**：几十行代码即可实现

#### 缺点

⚠️ **不持久化**：服务重启后丢失  
⚠️ **不支持分布式**：多实例下无法共享  
⚠️ **内存占用**：大量上传会占用内存  
⚠️ **无法断点续传**：用户刷新页面后无法恢复

#### 适用场景

- ✅ 单实例部署
- ✅ 上传时间短（<5 分钟）
- ✅ 不需要断点续传
- ✅ 开发/测试环境

---

### 方案 2: 文件系统存储（较简单）

#### 实现原理

```typescript
// api/services/chunkFileStore.ts

import fs from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_TEMP_DIR || '/tmp/uploads';

/**
 * 创建上传会话
 */
export async function createSession(userId: string, totalChunks: number): Promise<string> {
  const sessionId = `upload_${userId}_${Date.now()}`;
  const sessionDir = path.join(UPLOAD_DIR, sessionId);
  
  // 创建会话目录
  await fs.mkdir(sessionDir, { recursive: true });
  
  // 保存元数据
  await fs.writeFile(
    path.join(sessionDir, 'meta.json'),
    JSON.stringify({
      userId,
      totalChunks,
      createdAt: Date.now(),
    })
  );
  
  return sessionId;
}

/**
 * 保存分片
 */
export async function saveChunk(
  sessionId: string, 
  chunkIndex: number, 
  data: Buffer
): Promise<void> {
  const sessionDir = path.join(UPLOAD_DIR, sessionId);
  const chunkFile = path.join(sessionDir, `chunk_${chunkIndex}`);
  
  await fs.writeFile(chunkFile, data);
}

/**
 * 获取完整数据
 */
export async function assembleChunks(sessionId: string): Promise<Buffer> {
  const sessionDir = path.join(UPLOAD_DIR, sessionId);
  
  // 读取元数据
  const metaContent = await fs.readFile(path.join(sessionDir, 'meta.json'), 'utf-8');
  const meta = JSON.parse(metaContent);
  
  // 读取所有分片
  const buffers: Buffer[] = [];
  for (let i = 0; i < meta.totalChunks; i++) {
    const chunkFile = path.join(sessionDir, `chunk_${i}`);
    const chunk = await fs.readFile(chunkFile);
    buffers.push(chunk);
  }
  
  // 清理临时文件
  await fs.rm(sessionDir, { recursive: true, force: true });
  
  return Buffer.concat(buffers);
}

/**
 * 定期清理过期会话
 */
async function cleanupExpiredSessions() {
  const sessions = await fs.readdir(UPLOAD_DIR);
  const now = Date.now();
  const timeout = 60 * 60 * 1000;  // 1 小时
  
  for (const sessionId of sessions) {
    const sessionDir = path.join(UPLOAD_DIR, sessionId);
    const metaFile = path.join(sessionDir, 'meta.json');
    
    try {
      const metaContent = await fs.readFile(metaFile, 'utf-8');
      const meta = JSON.parse(metaContent);
      
      if (now - meta.createdAt > timeout) {
        await fs.rm(sessionDir, { recursive: true, force: true });
        console.log(`🧹 清理过期会话: ${sessionId}`);
      }
    } catch (error) {
      // 忽略错误
    }
  }
}

setInterval(cleanupExpiredSessions, 5 * 60 * 1000);
```

#### 优点

✅ **持久化**：服务重启后仍然存在  
✅ **支持断点续传**：可以检查已上传的分片  
✅ **内存友好**：不占用应用内存  
✅ **简单可靠**：文件系统是最基础的存储

#### 缺点

⚠️ **不支持分布式**：多实例需要共享文件系统（如 NFS）  
⚠️ **IO 开销**：频繁读写磁盘  
⚠️ **并发性能**：大量并发上传时 IO 瓶颈  
⚠️ **需要清理**：需要定期清理临时文件

#### 适用场景

- ✅ 单实例部署
- ✅ 需要断点续传
- ✅ 上传时间较长（5-30 分钟）
- ✅ 并发量不高（<100 并发）

---

### 方案 3: Redis 存储（较复杂）

#### 实现原理

```typescript
// api/services/chunkRedisStore.ts

import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
});

/**
 * 创建上传会话
 */
export async function createSession(userId: string, totalChunks: number): Promise<string> {
  const sessionId = `upload_${userId}_${Date.now()}`;
  
  await redis.hset(`upload:${sessionId}`, {
    userId,
    totalChunks,
    createdAt: Date.now(),
  });
  
  // 设置 1 小时过期
  await redis.expire(`upload:${sessionId}`, 3600);
  
  return sessionId;
}

/**
 * 保存分片
 */
export async function saveChunk(
  sessionId: string, 
  chunkIndex: number, 
  data: Buffer
): Promise<void> {
  // 保存分片数据
  await redis.set(
    `upload:${sessionId}:chunk:${chunkIndex}`,
    data,
    'EX',
    3600
  );
  
  // 更新已上传分片列表
  await redis.sadd(`upload:${sessionId}:chunks`, chunkIndex);
}

/**
 * 获取完整数据
 */
export async function assembleChunks(sessionId: string): Promise<Buffer> {
  // 读取元数据
  const meta = await redis.hgetall(`upload:${sessionId}`);
  const totalChunks = parseInt(meta.totalChunks);
  
  // 读取所有分片
  const buffers: Buffer[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const chunk = await redis.getBuffer(`upload:${sessionId}:chunk:${i}`);
    if (!chunk) {
      throw new Error(`分片 ${i} 缺失`);
    }
    buffers.push(chunk);
  }
  
  // 清理 Redis 数据
  const keys = await redis.keys(`upload:${sessionId}*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
  
  return Buffer.concat(buffers);
}

/**
 * 检查已上传的分片（断点续传）
 */
export async function getUploadedChunks(sessionId: string): Promise<number[]> {
  const chunks = await redis.smembers(`upload:${sessionId}:chunks`);
  return chunks.map(c => parseInt(c));
}
```

#### 优点

✅ **支持分布式**：多实例自动共享  
✅ **高性能**：内存存储，速度快  
✅ **支持断点续传**：可以查询已上传分片  
✅ **自动过期**：TTL 机制自动清理  
✅ **高并发**：支持大量并发上传

#### 缺点

⚠️ **需要 Redis**：额外的基础设施  
⚠️ **成本**：需要维护 Redis 服务  
⚠️ **内存占用**：大量上传占用 Redis 内存  
⚠️ **复杂度**：需要配置和监控

#### 适用场景

- ✅ 分布式部署（多实例）
- ✅ 高并发场景（>100 并发）
- ✅ 需要断点续传
- ✅ 生产环境

---

### 方案 4: 数据库存储（不推荐）

#### 实现原理

```typescript
// api/services/chunkDbStore.ts

import { db } from '../db/connection';

// 数据库表结构
// CREATE TABLE upload_sessions (
//   session_id VARCHAR(100) PRIMARY KEY,
//   user_id VARCHAR(50),
//   total_chunks INT,
//   created_at BIGINT
// );
//
// CREATE TABLE upload_chunks (
//   session_id VARCHAR(100),
//   chunk_index INT,
//   data BLOB,
//   PRIMARY KEY (session_id, chunk_index)
// );

export async function saveChunk(
  sessionId: string,
  chunkIndex: number,
  data: Buffer
): Promise<void> {
  await db.query(
    'INSERT INTO upload_chunks (session_id, chunk_index, data) VALUES (?, ?, ?)',
    [sessionId, chunkIndex, data]
  );
}
```

#### 优点

✅ **持久化**：数据永久保存  
✅ **支持分布式**：多实例共享  
✅ **事务支持**：ACID 保证

#### 缺点

❌ **性能差**：数据库不适合存储大量二进制数据  
❌ **存储成本高**：BLOB 数据占用大量空间  
❌ **IO 密集**：频繁读写影响数据库性能  
❌ **慢**：比内存存储慢 10-100 倍

#### 适用场景

- ❌ **几乎不推荐**（除非有特殊需求）

---

### 方案 5: 混合存储（推荐生产环境）

#### 实现原理

```
小分片（<10MB）→ 内存存储
中分片（10-100MB）→ 文件系统
大分片（>100MB）→ Redis（如果有）或文件系统
```

```typescript
// api/services/chunkHybridStore.ts

import { MemoryStore } from './chunkMemoryStore';
import { FileStore } from './chunkFileStore';
import { RedisStore } from './chunkRedisStore';

const hasRedis = !!process.env.REDIS_HOST;

export async function saveChunk(
  sessionId: string,
  chunkIndex: number,
  data: Buffer,
  totalSize: number
): Promise<void> {
  // 小文件：内存
  if (totalSize < 10 * 1024 * 1024) {
    return MemoryStore.saveChunk(sessionId, chunkIndex, data);
  }
  
  // 大文件：优先 Redis，否则文件系统
  if (hasRedis) {
    return RedisStore.saveChunk(sessionId, chunkIndex, data);
  } else {
    return FileStore.saveChunk(sessionId, chunkIndex, data);
  }
}
```

#### 优点

✅ **灵活**：根据场景选择最优方案  
✅ **渐进式**：可以从简单开始，逐步升级  
✅ **高性能**：小文件快速，大文件可靠

#### 缺点

⚠️ **复杂**：需要维护多种实现

---

## 📊 方案对比总结

| 方案 | 复杂度 | 性能 | 分布式 | 断点续传 | 成本 | 推荐度 |
|------|--------|------|--------|---------|------|--------|
| **内存** | ⭐ | ⭐⭐⭐⭐⭐ | ❌ | ❌ | ✅ 0 元 | ⭐⭐⭐⭐ |
| **文件系统** | ⭐⭐ | ⭐⭐⭐ | ⚠️ | ✅ | ✅ 0 元 | ⭐⭐⭐⭐ |
| **Redis** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ | ✅ | ⚠️ 需要 | ⭐⭐⭐ |
| **数据库** | ⭐⭐ | ⭐ | ✅ | ✅ | ⚠️ 高 | ⭐ |
| **混合** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⚠️ | ✅ | ✅ 0-低 | ⭐⭐⭐⭐⭐ |

---

## 🎯 推荐策略

### 阶段 1: 起步阶段（内存存储）

```typescript
// 最简单的实现
const chunkSessions = new Map();

// 优点：
// - 零依赖
// - 零配置
// - 5 分钟实现

// 适用于：
// - 开发环境
// - 单实例部署
// - 上传时间 <5 分钟
```

**代码量**：~50 行  
**实施时间**：0.5 天

---

### 阶段 2: 改进阶段（文件系统）

```typescript
// 持久化到文件系统
await fs.writeFile(`/tmp/uploads/${sessionId}/chunk_${i}`, data);

// 优点：
// - 支持断点续传
// - 零外部依赖
// - 简单可靠

// 适用于：
// - 生产环境（单实例）
// - 需要断点续传
// - 并发量 <100
```

**代码量**：~100 行  
**实施时间**：1 天

---

### 阶段 3: 扩展阶段（Redis，按需）

```typescript
// 使用 Redis
await redis.set(`upload:${sessionId}:chunk:${i}`, data);

// 优点：
// - 支持分布式
// - 高并发
// - 自动过期

// 适用于：
// - 多实例部署
// - 高并发（>100）
// - 已有 Redis
```

**代码量**：~150 行  
**实施时间**：1-2 天  
**前提**：已有 Redis

---

## 💡 为什么我之前说需要 Redis？

### 我的假设（可能错误）

我之前潜意识里假设：

1. **生产环境** → 需要分布式
2. **分布式** → 需要共享存储
3. **共享存储** → Redis 是标准方案

但实际上：

```
你的项目可能是：
- 单实例部署 ✅
- 或负载均衡器有 session affinity ✅
- 上传时间短（<5 分钟）✅

这种情况下：
- 内存存储就够了 ✅
- 或文件系统存储 ✅
- 不需要 Redis ✅
```

---

## 🚀 实际推荐

### 对于你的项目

**第一阶段：内存存储**

```typescript
// 实现超简单
const uploadSessions = new Map<string, {
  chunks: Buffer[];
  totalChunks: number;
}>();

export function saveChunk(sessionId: string, index: number, data: Buffer) {
  const session = uploadSessions.get(sessionId);
  if (!session) throw new Error('会话不存在');
  session.chunks[index] = data;
}

export function assembleChunks(sessionId: string): Buffer {
  const session = uploadSessions.get(sessionId);
  if (!session) throw new Error('会话不存在');
  
  // 检查完整性
  if (session.chunks.length !== session.totalChunks) {
    throw new Error('分片不完整');
  }
  
  // 合并
  const result = Buffer.concat(session.chunks);
  
  // 清理
  uploadSessions.delete(sessionId);
  
  return result;
}
```

**优点**：
- ✅ 50 行代码
- ✅ 0 外部依赖
- ✅ 0 配置
- ✅ 0.5 天实现

**缺点**：
- ⚠️ 服务重启丢失（但上传时间短，影响小）
- ⚠️ 不支持多实例（但可能你是单实例）

---

### 如果未来需要升级

```typescript
// 渐进式升级路径

// 第一步：抽象存储接口
interface ChunkStore {
  saveChunk(sessionId: string, index: number, data: Buffer): Promise<void>;
  assembleChunks(sessionId: string): Promise<Buffer>;
}

// 第二步：实现多个存储
class MemoryChunkStore implements ChunkStore { /* ... */ }
class FileChunkStore implements ChunkStore { /* ... */ }
class RedisChunkStore implements ChunkStore { /* ... */ }

// 第三步：配置切换
const store: ChunkStore = process.env.REDIS_HOST 
  ? new RedisChunkStore()
  : new FileChunkStore();
```

---

## 📝 总结

### 核心答案

**分片不一定需要 Redis！**

| 场景 | 推荐方案 | 需要 Redis |
|------|---------|-----------|
| 开发环境 | 内存存储 | ❌ |
| 单实例生产 | 文件系统 | ❌ |
| 多实例生产 | Redis | ✅ |
| 高并发（>100） | Redis | ✅ |
| 已有 Redis | Redis | ✅ |

### 你的项目建议

**起步：内存存储**
- 代码量：50 行
- 时间：0.5 天
- 成本：0 元

**升级（如果需要）：文件系统**
- 代码量：+50 行
- 时间：+0.5 天
- 成本：0 元

**再升级（如果需要）：Redis**
- 代码量：+100 行
- 时间：+1 天
- 成本：Redis 服务

### 关键洞察

```
不要过度设计！

从最简单的方案开始：
1. 内存存储（50 行代码）
2. 如果不够，升级到文件系统（+50 行）
3. 如果还不够，再考虑 Redis（+100 行）

大部分情况下，内存或文件系统就够了。
```

---

**作者**: AI Assistant  
**日期**: 2024-12-30  
**版本**: 1.0.0

