# P0 收敛性重构：消除重复实现与架构旁路

## 一、问题背景

项目在快速迭代过程中，同一功能出现了多套实现，部分 API 绕过了 Clean Architecture 直接操作数据库。这些问题虽然不影响当前功能运行，但随着代码量增长，维护成本和出 bug 的概率在持续累积。

本次重构目标是**收敛**——不改变架构方向，只把散落的分叉统一回来。

### 核心问题清单

| # | 问题 | 影响范围 | 严重度 |
|---|------|---------|--------|
| 1 | 计划工具存在两套实现（`planningTools.ts` vs `plan-tools.plugin.ts`） | 3 个文件引用旧版 | 高 |
| 2 | `_clean/infrastructure/tools/tool-executor.ts` 是死代码 | 无引用，增加理解成本 | 中 |
| 3 | archive/unarchive/archived 三个 API 绕过 Clean Architecture | 直接操作 MongoDB，响应格式不统一 | 高 |

---

## 二、方案设计

### 问题 1：统一计划工具实现

**现状分析：**

两套实现的对比：

| 维度 | `planningTools.ts`（旧版） | `plan-tools.plugin.ts`（新版） |
|------|--------------------------|------------------------------|
| 调用方式 | `routePlanningTool(name, userId, params)` | `toolExecutor.execute(name, params, context)` |
| 限流 | 无 | 有（RateLimiter） |
| 熔断 | 无 | 有（CircuitBreaker） |
| 缓存 | 无 | 有（get_plan / list_plans 缓存 60s） |
| 指标 | 无 | 有（延迟、成功率、缓存命中率） |

引用旧版的文件：

```
api/workflows/chatWorkflowIntegration.ts   → routePlanningTool()
api/workflows/agentWorkflow.ts              → routePlanningTool()
api/_clean/infrastructure/tools/tool-executor.ts → routePlanningTool() (死代码)
```

引用新版的文件：

```
api/handlers/singleAgentHandler.ts → toolExecutor.execute()
```

**方案：**

将 `chatWorkflowIntegration.ts` 和 `agentWorkflow.ts` 中的 `routePlanningTool()` 调用替换为 `toolExecutor.execute()`。这样所有计划工具调用统一走插件系统的 execute 链路，自动获得限流、熔断、缓存能力。

替换后 `planningTools.ts` 不再有外部引用，可以保留文件但标记为 `@deprecated`，后续在 P1 清理。

### 问题 2：删除死代码

`api/_clean/infrastructure/tools/tool-executor.ts` 没有任何文件 import 它（项目内 grep 确认无引用）。它的功能与 `api/tools/core/execution/tool-executor.ts` 完全重复，直接删除。

### 问题 3：归档 API 接入 Clean Architecture

**现状：**

- `archive.ts`、`unarchive.ts`、`archived.ts` 三个文件直接 `getDatabase()` 操作 MongoDB
- 各自定义了 `successResponse` / `errorResponse`，返回 `{ statusCode, headers, body }` 对象
- 项目已有统一的 `_utils/response.ts`，返回标准 `Response` 对象

**方案：**

1. **扩展 Repository 接口**：在 `IConversationRepository` 中新增 `archive()`、`unarchive()`、`findArchived()` 三个方法
2. **扩展 Entity**：`ConversationEntity` 新增 `isArchived`、`archivedAt` 字段和 `archive()` / `unarchive()` 业务方法
3. **新增 Use Cases**：`ArchiveConversationUseCase`、`UnarchiveConversationUseCase`、`GetArchivedConversationsUseCase`
4. **重写 lambda 文件**：使用 DI 容器获取 Use Case，使用 `_utils/response.ts` 统一响应格式

---

## 三、实现计划

### Step 1: 统一计划工具

改动文件：
- `api/workflows/chatWorkflowIntegration.ts` — 替换 `routePlanningTool` → `toolExecutor.execute`
- `api/workflows/agentWorkflow.ts` — 同上
- `api/tools/plugins/planningTools.ts` — 添加 `@deprecated` 注释

### Step 2: 删除死代码

删除文件：
- `api/_clean/infrastructure/tools/tool-executor.ts`

### Step 3: 归档 API 接入 Clean Architecture

新增文件：
- `api/_clean/application/use-cases/conversation/archive-conversation.use-case.ts`
- `api/_clean/application/use-cases/conversation/unarchive-conversation.use-case.ts`
- `api/_clean/application/use-cases/conversation/get-archived-conversations.use-case.ts`

改动文件：
- `api/_clean/domain/entities/conversation.entity.ts` — 新增归档字段与方法
- `api/_clean/application/interfaces/repositories/conversation.repository.interface.ts` — 新增接口方法
- `api/_clean/infrastructure/repositories/conversation.repository.ts` — 实现新方法
- `api/_clean/di-container.ts` — 注册新 Use Cases
- `api/lambda/conversations/archive.ts` — 重写，走 Use Case + 统一响应
- `api/lambda/conversations/unarchive.ts` — 同上
- `api/lambda/conversations/archived.ts` — 同上

---

## 四、效果验证

- [ ] `planningTools.ts` 的 `routePlanningTool` 不再有外部调用方（grep 确认）
- [ ] `_clean/infrastructure/tools/tool-executor.ts` 已删除
- [ ] archive/unarchive/archived 三个 API 不再直接 import `getDatabase`
- [ ] 三个归档 API 返回标准 `Response` 对象（与 chat.ts、conversations.ts 一致）
- [ ] 所有现有功能正常工作（手动测试：归档、取消归档、获取归档列表、计划 CRUD）
