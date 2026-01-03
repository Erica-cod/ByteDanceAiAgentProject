# LRU 数据管理系统

## 📋 概述

为了应对用户增长带来的存储压力，我们实现了一套完整的 **LRU (Least Recently Used)** 数据管理方案，在 **MongoDB** 和 **LocalStorage** 两端都采用智能清理策略，既控制了存储成本，又保证了良好的用户体验。

---

## 🎯 核心目标

1. **控制存储压力** - 限制每个用户的活跃对话数量，自动归档旧对话
2. **保证用户体验** - 归档对话可恢复，最近使用的数据优先保留
3. **智能清理** - 基于访问频率和时间自动决策清理策略
4. **透明化管理** - 用户可以查看归档对话并恢复

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      LRU 数据管理系统                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────┐       ┌──────────────────────┐   │
│  │   MongoDB 端 LRU     │       │ LocalStorage 端 LRU  │   │
│  ├──────────────────────┤       ├──────────────────────┤   │
│  │ • 归档长期未访问对话  │       │ • 追踪对话访问时间    │   │
│  │ • 限制活跃对话数量    │       │ • 清理最少使用缓存    │   │
│  │ • 自动删除过期归档    │       │ • 监控存储使用率      │   │
│  │ • 提供恢复机制        │       │ • 智能降级处理        │   │
│  └──────────────────────┘       └──────────────────────┘   │
│            ↓                              ↓                  │
│  ┌──────────────────────┐       ┌──────────────────────┐   │
│  │   LRU 调度器         │       │   前端集成           │   │
│  │ • 定期清理任务        │       │ • 自动记录访问        │   │
│  │ • 手动触发清理        │       │ • 智能清理触发        │   │
│  │ • 状态监控            │       │ • 归档对话查看        │   │
│  └──────────────────────┘       └──────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 核心组件

### 1. LRU 配置 (`api/config/lruConfig.ts`)

提供灵活的配置参数，可根据环境自动切换：

```typescript
// 开发环境配置（默认）
{
  mongodb: {
    maxActiveConversationsPerUser: 50,    // 每用户最多 50 个活跃对话
    autoArchiveAfterDays: 30,             // 30 天未访问自动归档
    deleteArchivedAfterDays: 180,         // 归档 6 个月后删除
    maxArchivedConversationsPerUser: 100, // 每用户最多 100 个归档
    cleanupIntervalHours: 24,             // 每天清理一次
  },
  localStorage: {
    maxCachedConversations: 20,           // 最多缓存 20 个对话
    maxMessagesPerConversation: 500,      // 每个对话最多 500 条消息
    cacheExpireDays: 7,                   // 7 天未访问清理缓存
    storageUsageThreshold: 0.8,           // 使用率超过 80% 强制清理
  }
}

// 生产环境配置（更激进）
{
  mongodb: {
    maxActiveConversationsPerUser: 30,    // 更严格的限制
    autoArchiveAfterDays: 14,
    deleteArchivedAfterDays: 90,
    // ...
  }
}
```

### 2. MongoDB 端 LRU 服务 (`api/services/conversationLRUService.ts`)

#### 核心功能

##### 2.1 触发式归档

当用户创建新对话时，如果活跃对话数超限，自动归档最旧的对话：

```typescript
// 在创建对话时调用
const lruService = getConversationLRUService();
await lruService.archiveExcessConversationsForUser(userId);
```

##### 2.2 定期自动归档

每天自动扫描所有用户，归档长期未访问的对话：

```typescript
// 归档 30 天未访问的对话
await lruService.autoArchiveInactiveConversations();
```

##### 2.3 清理过期归档

删除归档时间超过 180 天的对话（可配置）：

```typescript
await lruService.deleteExpiredArchivedConversations();
```

##### 2.4 恢复归档对话

用户可以手动恢复归档的对话：

```typescript
const success = await lruService.restoreArchivedConversation(
  conversationId,
  userId
);
// 恢复后会自动触发归档其他旧对话（如果超限）
```

#### 数据模型更新

```typescript
export interface Conversation {
  // ... 原有字段
  lastAccessedAt?: Date;    // ✅ 最后访问时间（用于 LRU 排序）
  isArchived?: boolean;     // ✅ 是否已归档
  archivedAt?: Date;        // ✅ 归档时间
}
```

#### 数据库索引

```sql
-- LRU 相关索引
db.conversations.createIndex({ userId: 1, isArchived: 1 })
db.conversations.createIndex({ userId: 1, lastAccessedAt: -1 })
```

### 3. LocalStorage 端 LRU 管理 (`src/utils/localStorageLRU.ts`)

#### 核心功能

##### 3.1 访问追踪

自动记录对话的访问时间和消息数：

```typescript
// 在加载对话时调用
touchConversationCache(conversationId, messageCount);
```

##### 3.2 智能清理

根据使用率和配额自动决策清理策略：

```typescript
// 清理过期缓存（7 天未访问）
cleanupExpiredConversationCache();

// 清理超限缓存（保留最近 20 个）
cleanupExcessConversationCache();

// 智能清理（自动决策）
smartCleanupConversationCache();
```

##### 3.3 存储监控

实时监控 LocalStorage 使用率：

```typescript
const usage = getStorageUsage();
if (usage > 0.8) {
  // 触发强制清理
}
```

#### LRU 元数据结构

```typescript
interface LRUMetadata {
  version: number;
  conversations: [
    {
      conversationId: string;
      lastAccessedAt: number;  // 时间戳
      messageCount: number;    // 消息数
    }
  ];
  lastCleanupAt: number;
}
```

### 4. LRU 调度器 (`api/services/lruScheduler.ts`)

自动管理定期清理任务：

```typescript
import { startLRUScheduler, stopLRUScheduler } from './services/lruScheduler.js';

// 在应用启动时启动调度器
startLRUScheduler();

// 在应用关闭时停止调度器
stopLRUScheduler();
```

#### 调度器功能

- ✅ 定期执行完整清理流程（可配置间隔）
- ✅ 手动触发清理
- ✅ 查询调度器状态
- ✅ 记录执行历史

---

## 📡 API 端点

### 1. 获取归档对话列表

```http
GET /api/conversations/archived?userId={userId}&limit=20&skip=0
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "conversations": [
      {
        "conversationId": "xxx",
        "title": "对话标题",
        "archivedAt": "2024-01-01T00:00:00.000Z",
        "messageCount": 50
      }
    ],
    "total": 5
  }
}
```

### 2. 恢复归档对话

```http
POST /api/conversations/archived/restore
Content-Type: application/json

{
  "conversationId": "xxx",
  "userId": "user_123"
}
```

### 3. 查询 LRU 调度器状态（管理员）

```http
GET /api/admin/lru-status
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "isRunning": false,
    "isScheduled": true,
    "lastRunAt": "2024-01-01T00:00:00.000Z",
    "lastResult": {
      "archived": 10,
      "deletedExpired": 5,
      "deletedExcess": 2,
      "duration": 1234
    },
    "config": {
      // ... 当前配置
    }
  }
}
```

### 4. 手动触发清理任务（管理员）

```http
POST /api/admin/lru-status/trigger
```

---

## 🚀 使用指南

### 后端集成

#### 1. 启动 LRU 调度器

在应用启动入口（如 `modern.server-runtime.ts` 或主入口文件）：

```typescript
import { startLRUScheduler } from './api/services/lruScheduler.js';

// 应用启动时
startLRUScheduler();

// 优雅关闭时
process.on('SIGTERM', () => {
  const { stopLRUScheduler } = require('./api/services/lruScheduler.js');
  stopLRUScheduler();
});
```

#### 2. 更新对话访问时间

在获取对话消息时调用：

```typescript
import { getConversationLRUService } from './api/services/conversationLRUService.js';

// 在 GET /api/messages/:conversationId 中
const lruService = getConversationLRUService();
await lruService.touchConversation(conversationId, userId);
```

#### 3. 触发式归档

在创建新对话时检查并归档：

```typescript
// 在 POST /api/conversations 中
const lruService = getConversationLRUService();
await lruService.archiveExcessConversationsForUser(userId);
```

### 前端集成

#### 1. 初始化 LocalStorage LRU

在 `App.tsx` 中：

```typescript
import { initLocalStorageLRU } from './utils/localStorageLRU';

useEffect(() => {
  initLocalStorageLRU();
}, []);
```

#### 2. 记录对话访问

在 `chatStore` 的 `loadConversation` 中：

```typescript
import { touchConversationCache, smartCleanupConversationCache } from './utils/localStorageLRU';

// 加载对话时
touchConversationCache(conversationId, messageCount);

// 保存缓存后触发智能清理
setTimeout(() => smartCleanupConversationCache(), 0);
```

#### 3. 查看归档对话

创建归档对话查看组件：

```typescript
import { getArchivedConversations, restoreArchivedConversation } from './utils/conversationArchivedAPI';

const ArchivedConversations = () => {
  const [archived, setArchived] = useState([]);

  useEffect(() => {
    getArchivedConversations(userId).then(data => {
      setArchived(data.conversations);
    });
  }, [userId]);

  const handleRestore = async (conversationId) => {
    const success = await restoreArchivedConversation(conversationId, userId);
    if (success) {
      // 刷新列表
    }
  };

  return (
    <div>
      {archived.map(conv => (
        <div key={conv.conversationId}>
          <span>{conv.title}</span>
          <button onClick={() => handleRestore(conv.conversationId)}>
            恢复
          </button>
        </div>
      ))}
    </div>
  );
};
```

---

## 📊 清理流程图

```
用户创建新对话
    ↓
检查活跃对话数
    ↓
超过限制？
    ↓ 是
归档最旧的对话
    ↓
保存新对话
    ↓
更新 lastAccessedAt

─────────────────

定期清理任务 (每天执行)
    ↓
1. 归档 30 天未访问的对话
    ↓
2. 删除过期归档 (180 天)
    ↓
3. 清理超限归档
    ↓
记录执行结果

─────────────────

前端缓存管理
    ↓
加载对话时记录访问
    ↓
保存缓存后检查
    ↓
超过 20 个或使用率 > 80%？
    ↓ 是
清理最少使用的缓存
```

---

## 🎨 用户体验优化

### 1. 渐进式归档

- ✅ 优先归档访问时间最早的对话
- ✅ 保留最近使用的对话
- ✅ 归档不影响数据完整性

### 2. 透明化管理

- ✅ 用户可以查看所有归档对话
- ✅ 一键恢复归档对话
- ✅ 清晰的归档时间显示

### 3. 无感知清理

- ✅ 后台自动清理，不阻塞用户操作
- ✅ 智能决策清理时机
- ✅ 优雅降级（存储满时）

### 4. 性能优化

- ✅ 异步清理任务
- ✅ 批量数据库操作
- ✅ 最小化前端阻塞

---

## 🧪 测试场景

### 1. 超限归档测试

```typescript
// 创建 51 个对话，验证第 1 个是否被归档
for (let i = 0; i < 51; i++) {
  await createConversation(userId, `对话 ${i}`);
}

const archived = await getArchivedConversations(userId);
assert(archived.total === 1);
```

### 2. 恢复归档测试

```typescript
const conversationId = '...';
const success = await restoreArchivedConversation(conversationId, userId);
assert(success === true);

// 验证对话重新出现在活跃列表
const active = await getConversations(userId);
assert(active.some(c => c.conversationId === conversationId));
```

### 3. LocalStorage 清理测试

```typescript
// 缓存 25 个对话
for (let i = 0; i < 25; i++) {
  touchConversationCache(`conv_${i}`, 100);
}

// 触发清理
const cleaned = smartCleanupConversationCache();
assert(cleaned === 5); // 清理了 5 个

// 验证只保留最近 20 个
const cached = getCachedConversations();
assert(cached.length === 20);
```

---

## ⚙️ 配置建议

### 小型应用（< 1000 用户）

```typescript
{
  mongodb: {
    maxActiveConversationsPerUser: 50,
    autoArchiveAfterDays: 30,
    deleteArchivedAfterDays: 0, // 永不删除
  },
  localStorage: {
    maxCachedConversations: 20,
    cacheExpireDays: 7,
  }
}
```

### 中型应用（1000 - 10000 用户）

```typescript
{
  mongodb: {
    maxActiveConversationsPerUser: 30,
    autoArchiveAfterDays: 14,
    deleteArchivedAfterDays: 180,
  },
  localStorage: {
    maxCachedConversations: 15,
    cacheExpireDays: 5,
  }
}
```

### 大型应用（> 10000 用户）

```typescript
{
  mongodb: {
    maxActiveConversationsPerUser: 20,
    autoArchiveAfterDays: 7,
    deleteArchivedAfterDays: 90,
  },
  localStorage: {
    maxCachedConversations: 10,
    cacheExpireDays: 3,
  }
}
```

---

## 🔍 监控和维护

### 1. 查看 LRU 状态

```bash
curl http://localhost:8080/api/admin/lru-status
```

### 2. 手动触发清理

```bash
curl -X POST http://localhost:8080/api/admin/lru-status/trigger
```

### 3. 监控数据库指标

```javascript
// 统计各状态对话数
db.conversations.aggregate([
  {
    $group: {
      _id: { isArchived: '$isArchived', isActive: '$isActive' },
      count: { $sum: 1 }
    }
  }
]);

// 统计每个用户的对话数
db.conversations.aggregate([
  {
    $group: {
      _id: '$userId',
      active: { $sum: { $cond: ['$isActive', 1, 0] } },
      archived: { $sum: { $cond: ['$isArchived', 1, 0] } }
    }
  },
  { $sort: { active: -1 } }
]);
```

---

## 🚨 常见问题

### Q1: 归档的对话还能访问吗？

**A:** 可以！归档只是标记为不活跃，数据仍然保留在数据库中。用户可以通过"归档对话"列表查看并恢复。

### Q2: LocalStorage 满了怎么办？

**A:** 系统会自动触发智能清理，优先删除最少使用的缓存。如果仍然不够，会降级到只保留最少量的缓存。

### Q3: 清理任务会影响性能吗？

**A:** 不会。清理任务是异步执行的，使用批量操作优化性能，不会阻塞用户请求。

### Q4: 如何调整清理策略？

**A:** 修改 `api/config/lruConfig.ts` 中的配置参数，支持根据环境自动切换。

---

## 📚 相关文档

- [数据库设计](./DATABASE_DESIGN.md)
- [性能优化](../06-Performance-Optimization/)
- [用户体验优化](../11-Interview-Prep/USER_BEHAVIOR_PREDICTION_SPEECH.md)

---

## 🎉 总结

通过实现双端 LRU 管理，我们成功地：

1. ✅ **控制了存储成本** - 每个用户最多保留有限数量的活跃对话
2. ✅ **保证了用户体验** - 归档对话可恢复，最近使用的数据优先保留
3. ✅ **提升了系统性能** - 减少了数据库和前端的存储压力
4. ✅ **增强了可维护性** - 提供了完善的监控和管理工具

这套方案可以随着用户规模增长而灵活调整，是一个可扩展的长期解决方案。

