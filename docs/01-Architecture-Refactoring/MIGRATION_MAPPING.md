# 代码迁移对照表

本文档详细说明如何将现有代码迁移到新的 Clean Architecture 结构。

---

## 📋 总体迁移策略

```
旧架构（平面结构）           →           新架构（分层结构）
├── agents/                  →  infrastructure/ai-agents/
├── config/                  →  shared/config/
├── db/                      →  infrastructure/database/ + domain/entities/
├── handlers/                →  infrastructure/streaming/ + application/services/
├── lambda/                  →  保持不变（但内部重构）
├── services/                →  application/use-cases/ + infrastructure/external-services/
├── tools/                   →  infrastructure/tools/
├── types/                   →  shared/types/ + domain/entities/
├── utils/                   →  shared/utils/
└── workflows/               →  application/services/
```

---

## 🗂️ 详细迁移对照表

### 1. 数据库相关（db/）

| 旧路径 | 新路径 | 迁移方式 |
|--------|--------|----------|
| `db/connection.ts` | `infrastructure/database/mongodb/connection.ts` | **移动** + 简化（去除业务逻辑） |
| `db/models.ts` | **拆分到多个位置：** | |
| ├─ 接口定义 | `domain/entities/*.entity.ts` | **转换**为 Entity 类（包含业务逻辑） |
| ├─ 请求/响应类型 | `presentation/dto/*.dto.ts` | **转换**为 DTO 类 |
| └─ Repository 接口 | `application/interfaces/repositories/*.interface.ts` | **新建**接口定义 |

#### 迁移示例：Conversation

```typescript
// ❌ 旧代码：db/models.ts
export interface Conversation {
  _id?: string;
  conversationId: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  isActive: boolean;
}

// ✅ 新代码：domain/entities/conversation.entity.ts
export class ConversationEntity {
  private constructor(
    public readonly id: string,
    public readonly userId: string,
    private _title: string,
    // ... 其他字段
  ) {
    this.validate(); // ✨ 业务规则验证
  }

  static create(userId: string, title: string): ConversationEntity { /* ... */ }
  updateTitle(newTitle: string): void { /* ... */ } // ✨ 业务方法
  toPersistence() { /* ... */ } // 转换为持久化格式
}
```

---

### 2. 服务层（services/）

| 旧路径 | 新路径 | 迁移方式 |
|--------|--------|----------|
| `services/conversationService.ts` | **拆分到：** | |
| ├─ 数据访问逻辑 | `infrastructure/database/mongodb/repositories/conversation.repository.ts` | **提取** Repository 实现 |
| ├─ 业务用例 | `application/use-cases/conversation/*.use-case.ts` | **提取** Use Case |
| └─ 业务规则 | `domain/entities/conversation.entity.ts` | **移动**到 Entity |
| `services/messageService.ts` | **同上模式** | 拆分为 Repository + Use Case + Entity |
| `services/userService.ts` | **同上模式** | 拆分为 Repository + Use Case + Entity |
| `services/planService.ts` | **同上模式** | 拆分为 Repository + Use Case + Entity |

#### 迁移示例：conversationService.ts

```typescript
// ❌ 旧代码：services/conversationService.ts（混合了多种职责）
export class ConversationService {
  async createConversation(userId: string, title?: string) {
    // 1. 验证逻辑
    if (!userId) throw new Error('Invalid user');
    
    // 2. 数据库操作
    const db = await getDatabase();
    const collection = db.collection('conversations');
    const conversation = {
      conversationId: uuid(),
      userId,
      title: title || '新对话',
      createdAt: new Date(),
      // ...
    };
    await collection.insertOne(conversation);
    
    // 3. 返回
    return conversation;
  }
}

// ✅ 新代码拆分为三层：

// 1️⃣ Domain Layer - 业务规则
// domain/entities/conversation.entity.ts
export class ConversationEntity {
  static create(userId: string, title?: string): ConversationEntity {
    // 验证逻辑在实体内部
    return new ConversationEntity(/* ... */);
  }
}

// 2️⃣ Infrastructure Layer - 数据访问
// infrastructure/database/mongodb/repositories/conversation.repository.ts
export class MongoConversationRepository implements IConversationRepository {
  async save(conversation: ConversationEntity): Promise<void> {
    const collection = this.db.collection('conversations');
    await collection.insertOne(conversation.toPersistence());
  }
}

// 3️⃣ Application Layer - 用例编排
// application/use-cases/conversation/create-conversation.use-case.ts
export class CreateConversationUseCase {
  async execute(input: CreateConversationInput): Promise<CreateConversationOutput> {
    const conversation = ConversationEntity.create(input.userId, input.title);
    await this.conversationRepository.save(conversation);
    return { conversationId: conversation.id, /* ... */ };
  }
}
```

---

### 3. 外部服务（services/）

| 旧路径 | 新路径 | 迁移方式 |
|--------|--------|----------|
| `services/volcengineService.ts` | `infrastructure/external-services/llm/volcengine.service.ts` | **移动** + 实现接口 |
| `services/modelService.ts` | `infrastructure/external-services/llm/model.service.ts` | **移动** + 实现接口 |
| `services/redisClient.ts` | `infrastructure/database/redis/client.ts` | **移动** |
| `services/deviceTracker.ts` | `infrastructure/external-services/analytics/device-tracker.service.ts` | **移动** |
| `services/metricsCollector.ts` | `infrastructure/external-services/metrics/metrics-collector.service.ts` | **移动** |

#### 迁移步骤：

1. **定义接口**（Application Layer）：

```typescript
// application/interfaces/services/llm.service.interface.ts
export interface ILLMService {
  chat(input: ChatInput): Promise<ChatOutput>;
  streamChat(input: ChatInput): AsyncGenerator<string>;
}
```

2. **实现接口**（Infrastructure Layer）：

```typescript
// infrastructure/external-services/llm/volcengine.service.ts
export class VolcengineService implements ILLMService {
  // 从旧的 volcengineService.ts 复制代码
  async chat(input: ChatInput): Promise<ChatOutput> { /* ... */ }
  async streamChat(input: ChatInput): AsyncGenerator<string> { /* ... */ }
}
```

---

### 4. AI Agents（agents/）

| 旧路径 | 新路径 | 迁移方式 |
|--------|--------|----------|
| `agents/baseAgent.ts` | `infrastructure/ai-agents/base/base-agent.ts` | **移动** |
| `agents/hostAgent.ts` | `infrastructure/ai-agents/implementations/host-agent.ts` | **移动** |
| `agents/plannerAgent.ts` | `infrastructure/ai-agents/implementations/planner-agent.ts` | **移动** |
| `agents/criticAgent.ts` | `infrastructure/ai-agents/implementations/critic-agent.ts` | **移动** |
| `agents/reporterAgent.ts` | `infrastructure/ai-agents/implementations/reporter-agent.ts` | **移动** |

#### 迁移方式：**直接移动**（AI Agents 属于基础设施层）

```bash
# 直接移动文件
mv api/agents/*.ts api/infrastructure/ai-agents/implementations/
```

---

### 5. 工具（tools/）

| 旧路径 | 新路径 | 迁移方式 |
|--------|--------|----------|
| `tools/planningTools.ts` | `infrastructure/tools/planning-tools.ts` | **移动** |
| `tools/tavilySearch.ts` | `infrastructure/tools/search/tavily.service.ts` | **移动** + 实现接口 |
| `tools/timeTools.ts` | `infrastructure/tools/time-tools.ts` | **移动** |
| `tools/similarityTools.ts` | `infrastructure/tools/similarity-tools.ts` | **移动** |
| `tools/toolExecutor.ts` | `infrastructure/tools/tool-executor.ts` | **移动** |
| `tools/toolValidator.ts` | `infrastructure/tools/tool-validator.ts` | **移动** |

---

### 6. 工作流（workflows/）

| 旧路径 | 新路径 | 迁移方式 |
|--------|--------|----------|
| `workflows/agentWorkflow.ts` | `infrastructure/ai-agents/orchestrator/agent-workflow.ts` | **移动** |
| `workflows/multiAgentOrchestrator.ts` | `application/services/multi-agent-orchestration.service.ts` | **移动** + 重构为应用服务 |
| `workflows/chatWorkflowIntegration.ts` | `application/services/chat-orchestration.service.ts` | **重构**为应用服务 |

---

### 7. 处理器（handlers/）

| 旧路径 | 新路径 | 迁移方式 |
|--------|--------|----------|
| `handlers/sseHandler.ts` | `infrastructure/streaming/sse-handler.ts` | **移动** |
| `handlers/sseStreamWriter.ts` | `infrastructure/streaming/sse-stream-writer.ts` | **移动** |
| `handlers/sseLocalHandler.ts` | `infrastructure/streaming/sse-local-handler.ts` | **移动** |
| `handlers/sseVolcanoHandler.ts` | `infrastructure/streaming/sse-volcano-handler.ts` | **移动** |
| `handlers/multiAgentHandler.ts` | **拆分到：** | |
| ├─ 流式处理逻辑 | `infrastructure/streaming/multi-agent-stream-handler.ts` | **提取** |
| └─ 业务编排逻辑 | `application/services/multi-agent-orchestration.service.ts` | **提取** |
| `handlers/singleAgentHandler.ts` | **同上模式** | 拆分 |
| `handlers/workflowProcessor.ts` | `application/services/workflow-processing.service.ts` | **移动** |

---

### 8. 配置（config/）

| 旧路径 | 新路径 | 迁移方式 |
|--------|--------|----------|
| `config/env.ts` | `shared/config/env.config.ts` | **移动** |
| `config/systemPrompt.ts` | `shared/config/prompts.config.ts` | **移动** + 重命名 |
| `config/memoryConfig.ts` | `shared/config/memory.config.ts` | **移动** |
| `config/chunkingPrompts.ts` | `shared/config/prompts.config.ts` | **合并**到 prompts.config.ts |

---

### 9. 工具函数（utils/）

| 旧路径 | 新路径 | 迁移方式 |
|--------|--------|----------|
| `utils/contentExtractor.ts` | `shared/utils/content-extractor.ts` | **移动** |
| `utils/jsonExtractor.ts` | `shared/utils/json-extractor.ts` | **移动** |
| `utils/textChunker.ts` | `shared/utils/text-chunker.ts` | **移动** |
| `utils/llmCaller.ts` | `infrastructure/external-services/llm/llm-caller.ts` | **移动** + 重构 |
| `utils/sseStreamWriter.ts` | `infrastructure/streaming/sse-stream-writer.ts` | **移动** |
| `utils/toolExecutor.ts` | `infrastructure/tools/tool-executor.ts` | **移动** |

---

### 10. API 路由（lambda/）- ⚠️ 特殊处理

| 旧路径 | 新路径 | 迁移方式 |
|--------|--------|----------|
| `lambda/*.ts` | **保持位置不变** | **内部重构**：调用新的 Use Cases |

#### 重要：Lambda 目录不移动！

Modern.js BFF 要求 API 路由必须在 `api/lambda/` 目录，所以我们：

1. ✅ **保持文件位置不变**
2. ✅ **重构文件内部逻辑**
3. ✅ **调用新架构的 Use Cases**

#### 重构示例：

```typescript
// ❌ 旧代码：lambda/conversations.ts
import { getDatabase } from '../db/connection';
import { v4 as uuid } from 'uuid';

export const POST = async (request: Request) => {
  const body = await request.json();
  const db = await getDatabase();
  const collection = db.collection('conversations');
  
  const conversation = {
    conversationId: uuid(),
    userId: body.userId,
    title: body.title || '新对话',
    createdAt: new Date(),
    // ... 直接操作数据库
  };
  
  await collection.insertOne(conversation);
  return new Response(JSON.stringify(conversation));
};

// ✅ 新代码：lambda/conversations.ts（文件位置不变，但内部重构）
import { container } from '@/shared/container/di-container';
import { CreateConversationUseCase } from '@/application/use-cases/conversation/create-conversation.use-case';
import { validateCreateConversationRequest } from '@/presentation/validators/conversation.validator';

export const POST = async (request: Request) => {
  try {
    // 1. 验证请求
    const body = await request.json();
    const dto = validateCreateConversationRequest(body);
    
    // 2. 从容器获取 Use Case
    const useCase = container.get<CreateConversationUseCase>('CreateConversationUseCase');
    
    // 3. 执行业务逻辑（交给 Use Case）
    const result = await useCase.execute(dto);
    
    // 4. 返回响应
    return new Response(JSON.stringify({
      success: true,
      data: result,
    }));
  } catch (error) {
    // 统一错误处理
    return handleError(error);
  }
};
```

---

## 🔄 迁移顺序建议

### Phase 1: 基础设施（1-2天）

```
1. ✅ 创建新目录结构
2. ✅ 配置路径别名（tsconfig.json）
3. ✅ 设置依赖注入容器
4. ✅ 迁移配置文件（config/ → shared/config/）
5. ✅ 迁移工具函数（utils/ → shared/utils/）
```

### Phase 2: 数据层（2-3天）

```
1. ✅ 定义领域实体（db/models.ts → domain/entities/）
2. ✅ 定义 Repository 接口（application/interfaces/repositories/）
3. ✅ 实现 MongoDB Repositories（infrastructure/database/mongodb/repositories/）
4. ✅ 编写单元测试
```

**迁移顺序：**
1. Conversation（最简单）
2. Message
3. User
4. Plan

### Phase 3: 业务逻辑层（3-5天）

```
1. ✅ 创建 Use Cases（services/ → application/use-cases/）
2. ✅ 创建应用服务（application/services/）
3. ✅ 迁移外部服务（services/ → infrastructure/external-services/）
4. ✅ 编写集成测试
```

**迁移顺序：**
1. Conversation 管理
2. Message 管理
3. 聊天流程
4. 多 Agent 编排

### Phase 4: AI 功能（3-5天）

```
1. ✅ 迁移 AI Agents（agents/ → infrastructure/ai-agents/）
2. ✅ 迁移工具（tools/ → infrastructure/tools/）
3. ✅ 迁移工作流（workflows/ → application/services/）
4. ✅ 迁移流式处理（handlers/ → infrastructure/streaming/）
```

### Phase 5: API 层（2-3天）

```
1. ✅ 创建 DTO 和验证器（presentation/dto/, presentation/validators/）
2. ✅ 重构 Lambda 路由（调用新 Use Cases）
3. ✅ 添加错误处理和日志
4. ✅ 编写 E2E 测试
```

### Phase 6: 清理和优化（1-2天）

```
1. ✅ 删除旧代码
2. ✅ 更新文档
3. ✅ 性能测试和优化
4. ✅ Code Review
```

---

## ✅ 迁移检查清单

使用这个清单确保每个模块都正确迁移：

### 单个模块迁移清单

- [ ] **领域层**
  - [ ] 创建 Entity 类
  - [ ] 添加业务规则验证
  - [ ] 添加业务方法
  - [ ] 编写 Entity 单元测试

- [ ] **应用层**
  - [ ] 定义 Repository 接口
  - [ ] 创建 Use Cases
  - [ ] 编写 Use Case 集成测试

- [ ] **基础设施层**
  - [ ] 实现 MongoDB Repository
  - [ ] 添加索引和优化
  - [ ] 编写 Repository 测试

- [ ] **表示层**
  - [ ] 创建 DTO
  - [ ] 创建验证器
  - [ ] 重构 Lambda 路由
  - [ ] 编写 API 测试

- [ ] **依赖注入**
  - [ ] 注册到 DI 容器
  - [ ] 配置生命周期

- [ ] **文档**
  - [ ] 更新 API 文档
  - [ ] 更新架构文档

---

## 📊 迁移进度追踪

创建一个 `MIGRATION_PROGRESS.md` 文件追踪进度：

```markdown
# 重构进度追踪

## Conversation 模块
- [x] Domain Entity
- [x] Repository 接口
- [x] Repository 实现
- [x] Use Cases
- [x] API 重构
- [x] 测试
- [x] 文档

## Message 模块
- [ ] Domain Entity
- [ ] Repository 接口
- [ ] Repository 实现
- [ ] Use Cases
- [ ] API 重构
- [ ] 测试
- [ ] 文档

## User 模块
- [ ] ...

## Chat 流程
- [ ] ...

## 多 Agent 编排
- [ ] ...
```

---

## 🆘 迁移问题排查

### 问题1: 导入路径报错

**症状：** `Cannot find module '@/domain/...'`

**解决：**
1. 检查 `tsconfig.json` 中的 `paths` 配置
2. 检查文件路径是否正确
3. 重启 IDE

### 问题2: 依赖注入失败

**症状：** `No matching bindings found`

**解决：**
1. 检查是否在容器中注册了依赖
2. 检查标识符是否匹配
3. 检查是否引入了 `reflect-metadata`

### 问题3: 旧代码仍在调用

**症状：** 修改了新代码，但没有生效

**解决：**
1. 检查 Lambda 路由是否还在调用旧 Service
2. 搜索旧代码引用：`grep -r "conversationService" api/lambda/`
3. 逐步替换旧引用

---

## 💡 迁移技巧

### 技巧1: 使用 Adapter 模式过渡

```typescript
// 适配器：让旧代码使用新接口
class LegacyServiceAdapter implements IConversationRepository {
  constructor(private legacyService: ConversationService) {}

  async findById(id: string) {
    const result = await this.legacyService.getConversation(id);
    return ConversationEntity.fromPersistence(result);
  }
}
```

### 技巧2: 使用功能开关

```typescript
const USE_NEW_ARCH = process.env.USE_NEW_ARCHITECTURE === 'true';

if (USE_NEW_ARCH) {
  // 使用新架构
  return await newUseCase.execute(input);
} else {
  // 使用旧代码
  return await legacyService.create(input);
}
```

### 技巧3: 并行运行新旧代码

```typescript
// 新旧代码都运行，但只返回新代码结果
const newResult = await newUseCase.execute(input);
const oldResult = await oldService.create(input);

// 比对结果（仅开发环境）
if (process.env.NODE_ENV === 'development') {
  compareResults(newResult, oldResult);
}

return newResult;
```

---

## 📚 参考资料

- [完整重构方案](./BACKEND_REFACTORING_PLAN.md)
- [代码示例](./REFACTORING_EXAMPLES.md)
- [快速开始](./REFACTORING_QUICK_START.md)

---

**最后更新：** 2025-01-01
**维护人：** AI Agent Team

