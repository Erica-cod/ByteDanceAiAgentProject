# LRU 数据管理 - 简化设计方案

## 🎯 设计理念

**前端主导，后端配合** - 由前端 LocalStorage LRU 驱动数据清理，同时通知后端归档，确保前后端一致性。

---

## 📐 架构对比

### ❌ 旧方案：双端独立 LRU（容易不一致）

```
┌─────────────────┐         ┌─────────────────┐
│  前端 LRU 清理   │         │  后端 LRU 清理   │
│  • 清理本地缓存  │         │  • 归档旧对话    │
│  • 独立决策     │   ❌    │  • 独立决策      │
└─────────────────┘  不同步  └─────────────────┘
         ↓                          ↓
    可能不一致！                前端重新拉取
```

**问题：**
- 前端删除缓存，后端对话仍活跃
- 下次访问时又从服务器拉回来
- 用户困惑：为什么删除的对话又出现了？

### ✅ 新方案：前端驱动，后端同步（保持一致）

```
┌─────────────────────────────────────┐
│       前端 LocalStorage LRU          │
│                                      │
│  1. 检测到需要清理                    │
│  2. 删除本地缓存                     │
│  3. 调用 API 通知服务器归档          │
└───────────────┬─────────────────────┘
                │
                ↓ POST /api/conversations/archive
┌───────────────────────────────────────┐
│       后端 MongoDB                     │
│                                        │
│  1. 接收归档请求                       │
│  2. 标记对话为 isArchived = true      │
│  3. 返回成功                           │
└────────────────────────────────────────┘

结果：前后端状态一致 ✅
```

**优势：**
- ✅ 前后端状态始终一致
- ✅ 逻辑简单，易于理解和维护
- ✅ 前端完全控制哪些对话保留在缓存
- ✅ 后端只负责执行归档指令

---

## 🔧 核心实现

### 1. 前端：LocalStorage LRU 管理

```typescript
// src/utils/localStorageLRU.ts

/**
 * 智能清理：根据使用率和配额自动决策
 */
export async function smartCleanupConversationCache(userId?: string): Promise<number> {
  const storageUsage = getStorageUsage();
  const forceCleanup = storageUsage > STORAGE_USAGE_THRESHOLD;

  let totalCleaned = 0;

  // 1. 清理过期的缓存
  const expiredCleaned = await cleanupExpiredConversationCache(forceCleanup, userId);
  totalCleaned += expiredCleaned;

  // 2. 清理超出配额的缓存
  if (forceCleanup || expiredCleaned === 0) {
    const excessCleaned = await cleanupExcessConversationCache(userId);
    totalCleaned += excessCleaned;
  }

  return totalCleaned;
}

/**
 * 清理过期缓存（同时通知服务器归档）
 */
async function cleanupExpiredConversationCache(
  force: boolean,
  userId?: string
): Promise<number> {
  const metadata = getLRUMetadata();
  const expireThreshold = Date.now() - CACHE_EXPIRE_DAYS * 24 * 60 * 60 * 1000;

  // 找出过期的对话
  const expiredConversations = metadata.conversations.filter(
    (c) => force || c.lastAccessedAt < expireThreshold
  );

  if (expiredConversations.length === 0) return 0;

  // ✅ 关键：通知服务器归档这些对话
  if (userId) {
    await notifyServerToArchive(
      expiredConversations.map(c => c.conversationId),
      userId
    );
  }

  // 删除本地缓存
  expiredConversations.forEach((c) => {
    localStorage.removeItem(`chat_cache_v1:${c.conversationId}`);
    localStorage.removeItem(`chat_${c.conversationId}`);
    localStorage.removeItem(`chat_cache_v2:${c.conversationId}`);
  });

  // 更新元数据
  metadata.conversations = metadata.conversations.filter(
    (c) => !expiredConversations.some((e) => e.conversationId === c.conversationId)
  );
  saveLRUMetadata(metadata);

  return expiredConversations.length;
}

/**
 * 通知服务器归档对话
 */
async function notifyServerToArchive(
  conversationIds: string[],
  userId: string
): Promise<void> {
  if (conversationIds.length === 0) return;

  // 批量归档请求
  const promises = conversationIds.map((conversationId) =>
    fetch('/api/conversations/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, userId }),
    }).catch((err) => {
      console.warn(`⚠️ 归档对话 ${conversationId} 失败:`, err);
    })
  );

  await Promise.all(promises);
  console.log(`✅ 已通知服务器归档 ${conversationIds.length} 个对话`);
}
```

### 2. 后端：简单的归档 API

```typescript
// api/lambda/conversations/archive.ts

/**
 * POST /api/conversations/archive - 归档对话
 * 前端在清理 LocalStorage 缓存时调用此接口
 */
export async function post({ data, headers }) {
  const { conversationId, userId } = data;

  const db = await getDatabase();
  const collection = db.collection<Conversation>('conversations');

  // 归档对话
  await collection.updateOne(
    { conversationId, userId, isActive: true },
    {
      $set: {
        isArchived: true,
        archivedAt: new Date(),
        isActive: false,
        updatedAt: new Date(),
      },
    }
  );

  console.log(`✅ 对话已归档: ${conversationId}`);
  return successResponse({ message: '对话已归档', conversationId });
}
```

### 3. 集成到 Chat Store

```typescript
// src/stores/chatStore.ts

loadConversation: async (convId) => {
  const { userId } = get();

  // 记录访问
  touchConversationCache(convId, 0);

  // 加载对话...
  const cached = await readConversationCache(convId);
  const result = await getConversationMessages(userId, convId, 30, 0);
  
  // 合并并保存缓存
  const merged = mergeServerMessagesWithCache(serverMessages, cached);
  await writeConversationCache(convId, merged);

  // ✅ 触发智能清理（传入 userId）
  setTimeout(() => smartCleanupConversationCache(userId), 0);
}
```

---

## 📋 API 端点

### 1. 归档对话

```http
POST /api/conversations/archive
Content-Type: application/json

{
  "conversationId": "conv_123",
  "userId": "user_456"
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "message": "对话已归档",
    "conversationId": "conv_123"
  }
}
```

### 2. 恢复归档对话

```http
POST /api/conversations/unarchive
Content-Type: application/json

{
  "conversationId": "conv_123",
  "userId": "user_456"
}
```

### 3. 获取归档对话列表

```http
GET /api/conversations/archived?userId=user_456&limit=20&skip=0
```

---

## 🚀 使用流程

### 场景 1：用户正常使用

```
1. 用户打开应用
   ↓
2. 初始化 LRU: initLocalStorageLRU(userId)
   ↓
3. 检查是否需要清理（24小时清理一次）
   ↓
4. 如需清理：
   - 找出过期对话（7天未访问）
   - 通知服务器归档
   - 删除本地缓存
```

### 场景 2：用户浏览对话

```
1. 用户加载对话 A
   ↓
2. touchConversationCache(A) - 记录访问时间
   ↓
3. 后台触发智能清理
   ↓
4. 如果缓存对话数 > 20：
   - 保留最近访问的 20 个
   - 其余通知服务器归档并删除缓存
```

### 场景 3：用户查看归档对话

```
1. 用户点击"归档对话"
   ↓
2. 调用 GET /api/conversations/archived
   ↓
3. 显示归档对话列表
   ↓
4. 用户点击"恢复"某个对话
   ↓
5. 调用 POST /api/conversations/unarchive
   ↓
6. 对话重新出现在活跃列表
```

---

## ✅ 优势总结

### 1. 一致性保证

- ✅ 前端删除缓存 = 后端标记归档
- ✅ 不会出现"删了又回来"的问题
- ✅ 用户看到的数据与服务器一致

### 2. 简单可靠

- ✅ 逻辑集中在前端，易于调试
- ✅ 后端只是简单的归档标记
- ✅ 不需要复杂的定时任务协调

### 3. 用户体验优化

- ✅ 前端完全控制缓存策略
- ✅ 最近使用的对话永远保留
- ✅ 归档对话可恢复，数据不丢失

### 4. 性能优化

- ✅ 减少 LocalStorage 占用
- ✅ 减少 MongoDB 活跃数据量
- ✅ 归档通知异步执行，不阻塞 UI

---

## 🧪 测试场景

### 测试 1：自动清理

```typescript
// 1. 创建 25 个对话并缓存
for (let i = 0; i < 25; i++) {
  await createAndCacheConversation(userId, `对话 ${i}`);
}

// 2. 触发清理
await smartCleanupConversationCache(userId);

// 3. 验证结果
const cached = getCachedConversations();
assert(cached.length === 20); // 只保留 20 个

// 4. 验证服务器状态
const active = await getActiveConversations(userId);
const archived = await getArchivedConversations(userId);
assert(active.length === 20);
assert(archived.length === 5); // 5 个被归档
```

### 测试 2：恢复归档对话

```typescript
// 1. 恢复一个归档对话
const result = await unarchiveConversation(conversationId, userId);
assert(result.success === true);

// 2. 验证对话重新出现在活跃列表
const active = await getActiveConversations(userId);
const found = active.some(c => c.conversationId === conversationId);
assert(found === true);
```

---

## 📊 配置参数

```typescript
// 可在 src/utils/localStorageLRU.ts 中调整

const MAX_CACHED_CONVERSATIONS = 20;  // 最多缓存 20 个对话
const CACHE_EXPIRE_DAYS = 7;          // 7 天未访问自动清理
const STORAGE_USAGE_THRESHOLD = 0.8;  // 使用率超过 80% 触发清理
```

---

## 🎯 总结

通过**前端驱动 + 后端同步**的简化设计，我们实现了：

1. ✅ **前后端一致性** - 避免数据不同步问题
2. ✅ **逻辑简单清晰** - 易于理解和维护
3. ✅ **用户体验优化** - 最近使用的数据优先保留
4. ✅ **性能提升** - 减少存储压力

这是一个**更简单、更可靠、更易维护**的 LRU 解决方案！🚀

