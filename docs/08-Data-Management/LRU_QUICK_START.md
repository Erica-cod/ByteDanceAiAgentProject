# LRU 数据管理 - 快速开始指南（简化版）

## 🚀 3 分钟快速集成

本指南帮助你快速在项目中启用**前端驱动的 LRU 数据管理**功能。

---

## 💡 核心理念

**前端主导，后端配合** - 由前端决定哪些对话需要清理，同时通知后端归档，确保前后端一致性。

---

## 📋 前置条件

- MongoDB 数据库已配置
- 项目已正常运行
- 已有对话和消息相关的 API

---

## 🔧 集成步骤

### 后端集成（1 步）✅ 已完成

归档 API 已创建：
- ✅ `POST /api/conversations/archive` - 归档对话
- ✅ `POST /api/conversations/unarchive` - 恢复归档对话
- ✅ `GET /api/conversations/archived` - 获取归档列表

**无需额外配置，API 已就绪！**

### 前端集成 ✅ 已完成

已自动集成到以下位置：
- ✅ `src/App.tsx` - 初始化 LRU
- ✅ `src/stores/chatStore.ts` - 记录访问并触发清理
- ✅ `src/utils/localStorageLRU.ts` - LRU 核心逻辑

**无需手动修改，开箱即用！**

---

## ✅ 工作原理

### 前端 LRU 清理流程

```
用户打开应用
    ↓
初始化 LRU 检查
    ↓
是否需要清理？
    ↓ 是
找出需要清理的对话
    ↓
调用 API 通知服务器归档
    ↓
删除本地缓存
    ↓
前后端状态一致 ✅
```

### 自动触发时机

1. **应用启动时** - 检查是否需要清理（24小时清理一次）
2. **加载对话后** - 后台异步检查并清理
3. **存储超限时** - 使用率 > 80% 立即清理

---

## ✅ 验证集成

### 1. 检查前端控制台

刷新页面后，应该看到：

```
🚀 初始化 LocalStorage LRU 管理...
📊 LocalStorage 使用率: 15.2%
从缓存加载对话: conv_123
```

### 2. 测试缓存清理

**测试场景：缓存超过 20 个对话**

打开浏览器控制台：

```javascript
// 查看当前缓存的对话数
import { getCachedConversations } from './utils/localStorageLRU';
console.log('缓存对话数:', getCachedConversations().length);
```

浏览超过 20 个对话后，最早访问的会自动清理。

### 3. 查看归档对话

```bash
curl "http://localhost:8080/api/conversations/archived?userId=your_user_id"
```

**预期响应：**

```json
{
  "success": true,
  "data": {
    "conversations": [
      {
        "conversationId": "conv_123",
        "title": "对话标题",
        "isArchived": true,
        "archivedAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "total": 5
  }
}
```

### 4. 测试恢复归档对话

```bash
curl -X POST http://localhost:8080/api/conversations/unarchive \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"conv_123","userId":"your_user_id"}'
```

---

## 🧪 测试脚本

### 简化测试（浏览器控制台）

打开浏览器控制台，执行：

```javascript
// 1. 查看当前缓存状态
const { getCachedConversations } = await import('./utils/localStorageLRU');
console.log('缓存对话:', getCachedConversations());

// 2. 手动触发清理
const { smartCleanupConversationCache } = await import('./utils/localStorageLRU');
const { getUserId } = await import('./utils/userManager');
const userId = getUserId();
const cleaned = await smartCleanupConversationCache(userId);
console.log(`清理了 ${cleaned} 个对话`);

// 3. 查看归档对话
const response = await fetch(`/api/conversations/archived?userId=${userId}`);
const data = await response.json();
console.log('归档对话:', data);
```

### 完整测试脚本

已迁移为 Jest 集成测试，运行：

```bash
# 需要服务端运行（以及 MongoDB 可用）
npm run dev

# 另一个终端运行（脚本会自动打开 RUN_LRU_TEST=1）
npm run test:lru
```

---

## ⚙️ 配置调整（可选）

如果你想调整 LRU 策略，修改 `src/utils/localStorageLRU.ts`：

```typescript
// 最多缓存的对话数量
const MAX_CACHED_CONVERSATIONS = 20;

// 缓存过期天数（未访问超过此天数的对话会被清理）
const CACHE_EXPIRE_DAYS = 7;

// 存储使用率阈值（超过此值触发强制清理）
const STORAGE_USAGE_THRESHOLD = 0.8; // 80%
```

**推荐配置：**

| 用户规模 | MAX_CACHED | CACHE_EXPIRE_DAYS | 说明 |
|---------|-----------|-------------------|------|
| 小型（< 1K用户） | 20 | 7 | 默认配置 |
| 中型（1K-10K） | 15 | 5 | 更激进的清理 |
| 大型（> 10K） | 10 | 3 | 最激进的清理 |

---

## 🎯 下一步

- ✅ **查看设计文档**: [LRU_SIMPLIFIED_DESIGN.md](./LRU_SIMPLIFIED_DESIGN.md)
- ✅ **创建归档对话 UI**: 让用户可以查看和恢复归档对话
- ✅ **监控清理效果**: 检查浏览器控制台的 LRU 日志
- ✅ **根据用户规模调整配置**: 修改 `localStorageLRU.ts` 中的参数

---

## 🚨 常见问题

### Q: 为什么没有看到对话被归档？

**A:** 归档触发条件：
1. 缓存的对话数超过 20 个
2. 对话超过 7 天未访问
3. LocalStorage 使用率超过 80%

刚创建的对话不会立即归档，需要满足上述条件之一。

### Q: 如何手动触发清理？

**A:** 在浏览器控制台执行：

```javascript
const { smartCleanupConversationCache } = await import('./utils/localStorageLRU');
const { getUserId } = await import('./utils/userManager');
await smartCleanupConversationCache(getUserId());
```

### Q: LocalStorage 清理会丢失数据吗？

**A:** 不会！LocalStorage 只是缓存，真实数据保存在 MongoDB 中。清理缓存后：
1. 前端通知服务器归档对话
2. 数据标记为 `isArchived = true`
3. 可通过 API 查询归档对话并恢复

### Q: 前后端会不会不一致？

**A:** 不会！新设计保证一致性：
- 前端删除缓存 → 同时通知服务器归档
- 后端接收通知 → 标记对话为归档
- 保证前后端状态完全同步 ✅

---

## 📞 获取帮助

如果遇到问题，请查看：

1. 后端日志（查找 `[LRU 调度器]` 相关日志）
2. 浏览器控制台（查找 LRU 相关日志）
3. MongoDB 数据（检查 `isArchived` 字段）

---

## 🎉 完成！

恭喜！你已经成功集成了**前端驱动的 LRU 数据管理系统**。现在你的应用可以：

- ✅ **自动清理缓存** - 最多保留 20 个最近使用的对话
- ✅ **前后端同步** - 清理时自动通知服务器归档
- ✅ **保证一致性** - 避免"删了又回来"的问题
- ✅ **数据不丢失** - 归档对话可随时恢复
- ✅ **性能优化** - 减少 LocalStorage 和 MongoDB 压力

这是一个**简单、可靠、易维护**的 LRU 解决方案！🚀

### 核心优势

| 特性 | 旧方案（双端独立） | 新方案（前端驱动） |
|-----|------------------|-------------------|
| 一致性 | ❌ 可能不一致 | ✅ 保证一致 |
| 复杂度 | 😰 复杂 | 😊 简单 |
| 维护性 | 😰 难维护 | 😊 易维护 |
| 用户体验 | ⚠️ 可能困惑 | ✅ 清晰明确 |

享受更高效的数据管理吧！🎉

