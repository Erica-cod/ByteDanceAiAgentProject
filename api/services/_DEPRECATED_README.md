# ⚠️ DEPRECATED - Phase 1 旧服务文件

## 🚨 重要通知

**此目录下的部分服务文件已被 Clean Architecture 替代，标记为废弃。**

---

## ❌ 已废弃的文件（请勿在新代码中使用）

### Phase 1 已迁移模块

以下文件已被新架构替代，保留仅用于参考和回滚：

| 废弃文件 | 替代实现 | 迁移日期 |
|---------|---------|----------|
| `conversationService.ts` | `api/_clean/infrastructure/repositories/conversation.repository.ts` | 2025-12-31 |
| `messageService.ts` | `api/_clean/infrastructure/repositories/message.repository.ts` | 2025-12-31 |
| `userService.ts` | `api/_clean/infrastructure/repositories/user.repository.ts` | 2025-12-31 |
| `uploadService.ts` | `api/_clean/infrastructure/repositories/upload.repository.ts` | 2025-12-31 |
| `deviceTracker.ts` | `api/_clean/infrastructure/repositories/device.repository.ts` | 2025-12-31 |
| `metricsCollector.ts` | `api/_clean/infrastructure/repositories/metrics.repository.ts` | 2025-12-31 |

### 如何使用新架构

```typescript
// ❌ 旧方式（已废弃）
import { ConversationService } from '../../services/conversationService';
const conversation = await ConversationService.createConversation(...);

// ✅ 新方式（Clean Architecture）
import { getContainer } from '../../_clean/di-container';
const container = getContainer();
const createConversationUseCase = container.getCreateConversationUseCase();
const conversation = await createConversationUseCase.execute(...);
```

---

## ✅ 仍在使用的文件（Phase 2 待迁移）

以下文件仍在使用中，将在 Phase 2 重构：

| 文件 | 用途 | Phase 2 迁移计划 |
|------|------|------------------|
| `conversationMemoryService.ts` | 对话记忆管理 | → Memory 模块 |
| `multiAgentSessionService.ts` | 多代理会话管理 | → Agent 模块 |
| `chunkingPlanReviewService.ts` | 分块计划审查 | → Chunking 模块 |
| `planService.ts` | 计划服务 | → Plan 模块 |
| `queueManager.ts` | 队列管理 | → Infrastructure/queue |
| `sseLimiter.ts` | SSE 限流 | → Infrastructure/streaming |
| `redisClient.ts` | Redis 客户端 | → Infrastructure/cache |
| `modelService.ts` | 模型服务 | → Infrastructure/llm |
| `volcengineService.ts` | 火山引擎服务 | → Infrastructure/llm |

**⚠️ 这些文件仍然是活跃的，请继续使用直到 Phase 2 完成迁移。**

---

## 📅 预计清理时间表

| 时间 | 行动 | 状态 |
|------|------|------|
| 2025-12-31 | 标记 Phase 1 文件为废弃 | ✅ 完成 |
| 2026-01-31 | 如果新架构稳定，删除废弃文件 | ⏳ 待定 |
| 2026-03-31 | Phase 2 完成后，删除剩余旧文件 | 🔮 计划中 |

---

## 🔄 回滚指南

如果新架构出现严重问题需要回滚：

1. **修改特性开关**:
   ```typescript
   // api/lambda/_utils/arch-switch.ts
   export const USE_CLEAN_ARCH = false; // 切换回旧架构
   ```

2. **重启服务**:
   ```bash
   npm run dev
   ```

3. **验证旧架构是否正常工作**

**⚠️ 注意**: 由于当前 `USE_CLEAN_ARCH` 强制为 `true`，需要手动修改代码才能回滚。

---

## 📞 相关文档

- **Phase 1 清理总结**: `docs/PHASE_1_CLEANUP_SUMMARY.md`
- **Phase 1 迁移完成报告**: `docs/CLEAN_ARCHITECTURE_MIGRATION_COMPLETE.md`
- **Phase 2 重构计划**: `docs/PHASE_2_HANDLERS_SERVICES_REFACTORING_PLAN.md`

---

**最后更新**: 2025年12月31日  
**维护者**: Backend Team

