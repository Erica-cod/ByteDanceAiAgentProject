# ⚠️ DEPRECATED: Legacy Service Layer

此目录下的服务文件已被迁移到 Clean Architecture。

## 🎯 迁移状态

### ✅ 已完成迁移的模块 (Phase 1 & Phase 2)

| 旧服务文件 | 新架构模块 | 迁移阶段 | 状态 |
|-----------|-----------|---------|-----|
| `conversationService.ts` | Conversation Module | Phase 1 | ✅ 完成 |
| `messageService.ts` | Message Module | Phase 1 | ✅ 完成 |
| `userService.ts` | User Module | Phase 1 | ✅ 完成 |
| `uploadService.ts` | Upload Module | Phase 1 | ✅ 完成 |
| `deviceTracker.ts` | Device Module | Phase 1 | ✅ 完成 |
| `metricsCollector.ts` | Metrics Module | Phase 1 | ✅ 完成 |
| `conversationMemoryService.ts` | Memory Module | Phase 2.2 | ✅ 完成 |
| `planService.ts` | Plan Module | Phase 2.3 | ✅ 完成 |
| `multiAgentSessionService.ts` | Agent Session Module | Phase 2.4 | ✅ 完成 |

### 🔧 已移动的基础设施服务 (Phase 2.1)

| 旧服务文件 | 新位置 | 状态 |
|-----------|-------|-----|
| `modelService.ts` | `api/_clean/infrastructure/llm/model-service.ts` | ✅ 已移动 |
| `volcengineService.ts` | `api/_clean/infrastructure/llm/volcengine-service.ts` | ✅ 已移动 |
| `redisClient.ts` | `api/_clean/infrastructure/cache/redis-client.ts` | ⚠️ 已移动 (deprecated) |
| `queueManager.ts` | `api/_clean/infrastructure/queue/queue-manager.ts` | ✅ 已移动 |
| `sseLimiter.ts` | `api/_clean/infrastructure/streaming/sse-limiter.ts` | ✅ 已移动 |

### 📦 特殊服务

| 服务文件 | 说明 | 状态 |
|---------|------|-----|
| `chunkingPlanReviewService.ts` | 超长文本分段分析服务（Map-Reduce） | 🟡 保留（特殊用途） |

## 📚 新架构使用方式

### 基本用法

```typescript
import { getContainer } from '../_clean/di-container.js';

// 获取容器实例
const container = getContainer();

// 获取并使用 Use Case
const createConversationUseCase = container.getCreateConversationUseCase();
const result = await createConversationUseCase.execute({ userId, title });
```

### 各模块 Use Cases

#### Conversation Module
```typescript
const container = getContainer();
const createConversation = container.getCreateConversationUseCase();
const getConversations = container.getGetConversationsUseCase();
const getConversation = container.getGetConversationUseCase();
const updateConversation = container.getUpdateConversationUseCase();
const deleteConversation = container.getDeleteConversationUseCase();
```

#### Message Module
```typescript
const addMessage = container.getAddMessageUseCase();
const getMessages = container.getGetMessagesUseCase();
const updateMessage = container.getUpdateMessageUseCase();
const deleteMessage = container.getDeleteMessageUseCase();
```

#### User Module
```typescript
const getOrCreateUser = container.getGetOrCreateUserUseCase();
const getUserById = container.getGetUserByIdUseCase();
const updateUser = container.getUpdateUserUseCase();
```

#### Upload Module
```typescript
const createSession = container.getCreateSessionUseCase();
const saveChunk = container.getSaveChunkUseCase();
const getSessionStatus = container.getGetSessionStatusUseCase();
```

#### Device Module
```typescript
const trackDevice = container.getTrackDeviceUseCase();
const getDeviceStats = container.getGetDeviceStatsUseCase();
const deleteDevice = container.getDeleteDeviceUseCase();
const cleanupExpiredDevices = container.getCleanupExpiredDevicesUseCase();
```

#### Metrics Module
```typescript
const getMetricsSnapshot = container.getGetMetricsSnapshotUseCase();
```

#### Memory Module (Phase 2.2)
```typescript
const getConversationContext = container.getGetConversationContextUseCase();
const getMemoryStats = container.getGetMemoryStatsUseCase();
```

#### Plan Module (Phase 2.3)
```typescript
const createPlan = container.getCreatePlanUseCase();
const updatePlan = container.getUpdatePlanUseCase();
const getPlan = container.getGetPlanUseCase();
const listPlans = container.getListPlansUseCase();
const deletePlan = container.getDeletePlanUseCase();
```

#### Agent Session Module (Phase 2.4)
```typescript
const saveSession = container.getSaveSessionUseCase();
const loadSession = container.getLoadSessionUseCase();
const deleteSession = container.getDeleteSessionUseCase();
const cleanExpiredSessions = container.getCleanExpiredSessionsUseCase();
const getSessionStats = container.getGetSessionStatsUseCase();
```

## 📖 文档参考

- 完整架构说明: `docs/CLEAN_ARCHITECTURE_INDEX.md`
- Phase 1 总结: `docs/CLEAN_ARCHITECTURE_MIGRATION_COMPLETE.md`
- Phase 2 计划: `docs/PHASE_2_HANDLERS_SERVICES_REFACTORING_PLAN.md`

## ⚠️ 重要提示

1. **请勿在新代码中使用这些服务！**
2. 这些文件保留用于：
   - 向后兼容（逐步迁移）
   - 参考旧实现
   - 对比新旧架构差异
3. 所有新功能应使用 Clean Architecture 实现
4. 旧代码迁移时应逐步替换为新 Use Cases

## 🗑️ 未来计划

待所有使用旧服务的代码迁移完成后，这些文件将被彻底删除。
