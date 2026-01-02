# 后端重构方案 - Clean Architecture + BFF

## 📋 目录
- [1. 重构目标](#1-重构目标)
- [2. 架构设计](#2-架构设计)
- [3. 目录结构规划](#3-目录结构规划)
- [4. 分层职责](#4-分层职责)
- [5. 实施步骤](#5-实施步骤)
- [6. 迁移策略](#6-迁移策略)
- [7. 技术栈与工具](#7-技术栈与工具)

---

## 1. 重构目标

### 1.1 核心目标
- ✅ **清晰的分层架构**：采用 Clean Architecture 思想，实现关注点分离
- ✅ **符合 BFF 模式**：利用 modern.js BFF 插件，为前端提供定制化 API
- ✅ **易于维护**：代码结构清晰，职责单一，易于理解和修改
- ✅ **便于扩展**：支持新功能快速接入，不影响现有代码
- ✅ **提高可测试性**：各层独立，便于单元测试和集成测试

### 1.2 参考架构
- **eShopOnWeb**: Clean Architecture、DDD 模式、Repository 模式
- **Modern.js BFF**: 函数式路由、自动 API 生成、类型安全

---

## 2. 架构设计

### 2.1 Clean Architecture 分层

```
┌─────────────────────────────────────────────────────────────┐
│                      Presentation Layer                      │
│                   (BFF API Routes - Lambda)                  │
│  - 处理 HTTP 请求/响应                                          │
│  - 参数验证和转换                                               │
│  - SSE 流式响应                                                │
└──────────────────────┬──────────────────────────────────────┘
                       │ 依赖
┌──────────────────────▼──────────────────────────────────────┐
│                     Application Layer                        │
│              (Use Cases / Application Services)              │
│  - 业务用例编排                                                │
│  - 跨服务协调                                                 │
│  - 事务管理                                                   │
└──────────────────────┬──────────────────────────────────────┘
                       │ 依赖
┌──────────────────────▼──────────────────────────────────────┐
│                       Domain Layer                           │
│                  (Entities, Interfaces)                      │
│  - 核心业务逻辑                                               │
│  - 领域实体                                                   │
│  - 领域服务                                                   │
│  - 接口定义（不依赖具体实现）                                    │
└──────────────────────▲──────────────────────────────────────┘
                       │ 实现
┌──────────────────────┴──────────────────────────────────────┐
│                   Infrastructure Layer                       │
│         (DB, External APIs, Tools, Workflows)                │
│  - 数据库访问（MongoDB）                                        │
│  - 外部服务集成（Volcengine, Redis）                            │
│  - 工具实现（Tavily Search, Planning Tools）                   │
│  - AI Agent & Workflow 编排                                   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 依赖规则
- **外层依赖内层**：Presentation → Application → Domain ← Infrastructure
- **核心不依赖外部**：Domain 层不依赖任何外部框架或库
- **依赖注入**：通过接口实现依赖倒置

---

## 3. 目录结构规划

### 3.1 新的目录结构

```
api/
├── 📁 presentation/              # 表示层（BFF API 路由）
│   ├── lambda/                  # Modern.js BFF 路由（保留现有位置）
│   │   ├── chat.ts             # 聊天 API
│   │   ├── conversations/      # 会话管理
│   │   ├── messages/           # 消息管理
│   │   ├── upload/             # 文件上传
│   │   ├── health.ts           # 健康检查
│   │   └── metrics.ts          # 性能指标
│   ├── dto/                    # 数据传输对象（请求/响应）
│   │   ├── chat.dto.ts
│   │   ├── conversation.dto.ts
│   │   ├── message.dto.ts
│   │   └── upload.dto.ts
│   ├── validators/             # 请求验证
│   │   ├── chat.validator.ts
│   │   └── upload.validator.ts
│   └── middleware/             # 中间件
│       ├── auth.middleware.ts
│       ├── rate-limit.middleware.ts
│       └── error-handler.middleware.ts
│
├── 📁 application/              # 应用层（用例编排）
│   ├── use-cases/              # 业务用例
│   │   ├── chat/
│   │   │   ├── send-message.use-case.ts
│   │   │   ├── stream-chat.use-case.ts
│   │   │   └── multi-agent-chat.use-case.ts
│   │   ├── conversation/
│   │   │   ├── create-conversation.use-case.ts
│   │   │   ├── get-conversation.use-case.ts
│   │   │   └── list-conversations.use-case.ts
│   │   ├── message/
│   │   │   ├── save-message.use-case.ts
│   │   │   └── get-messages.use-case.ts
│   │   └── upload/
│   │       ├── create-upload-session.use-case.ts
│   │       └── upload-chunk.use-case.ts
│   ├── services/               # 应用服务（跨用例协调）
│   │   ├── chat-orchestration.service.ts
│   │   ├── conversation-memory.service.ts
│   │   └── upload-coordination.service.ts
│   └── interfaces/             # 应用层接口
│       ├── repositories/       # Repository 接口定义
│       │   ├── conversation.repository.interface.ts
│       │   ├── message.repository.interface.ts
│       │   └── user.repository.interface.ts
│       └── services/           # 外部服务接口
│           ├── llm.service.interface.ts
│           ├── cache.service.interface.ts
│           └── search.service.interface.ts
│
├── 📁 domain/                   # 领域层（核心业务逻辑）
│   ├── entities/               # 领域实体
│   │   ├── conversation.entity.ts
│   │   ├── message.entity.ts
│   │   ├── user.entity.ts
│   │   └── plan.entity.ts
│   ├── value-objects/          # 值对象
│   │   ├── message-content.vo.ts
│   │   ├── timestamp.vo.ts
│   │   └── user-id.vo.ts
│   ├── services/               # 领域服务（纯业务逻辑）
│   │   ├── message-formatting.service.ts
│   │   └── conversation-title.service.ts
│   ├── events/                 # 领域事件
│   │   ├── message-created.event.ts
│   │   └── conversation-updated.event.ts
│   └── exceptions/             # 领域异常
│       ├── conversation-not-found.exception.ts
│       └── invalid-message.exception.ts
│
├── 📁 infrastructure/           # 基础设施层（外部依赖实现）
│   ├── database/               # 数据库实现
│   │   ├── mongodb/
│   │   │   ├── connection.ts
│   │   │   ├── repositories/   # Repository 具体实现
│   │   │   │   ├── conversation.repository.ts
│   │   │   │   ├── message.repository.ts
│   │   │   │   └── user.repository.ts
│   │   │   └── schemas/        # Mongoose Schemas
│   │   │       ├── conversation.schema.ts
│   │   │       └── message.schema.ts
│   │   └── redis/
│   │       ├── client.ts
│   │       └── cache.repository.ts
│   ├── external-services/      # 外部服务实现
│   │   ├── llm/
│   │   │   ├── volcengine.service.ts
│   │   │   └── ollama.service.ts
│   │   ├── search/
│   │   │   └── tavily.service.ts
│   │   └── metrics/
│   │       └── metrics-collector.service.ts
│   ├── ai-agents/              # AI Agent 实现
│   │   ├── base/
│   │   │   └── base-agent.ts
│   │   ├── implementations/
│   │   │   ├── host-agent.ts
│   │   │   ├── planner-agent.ts
│   │   │   ├── critic-agent.ts
│   │   │   └── reporter-agent.ts
│   │   └── orchestrator/
│   │       └── multi-agent-orchestrator.ts
│   ├── tools/                  # 工具实现
│   │   ├── planning-tools.ts
│   │   ├── search-tools.ts
│   │   └── time-tools.ts
│   └── streaming/              # 流式处理
│       ├── sse-handler.ts
│       └── stream-writer.ts
│
└── 📁 shared/                   # 共享代码
    ├── config/                 # 配置
    │   ├── env.config.ts
    │   ├── prompts.config.ts
    │   └── memory.config.ts
    ├── constants/              # 常量
    │   ├── model.constants.ts
    │   └── status.constants.ts
    ├── types/                  # 共享类型
    │   ├── common.types.ts
    │   └── api.types.ts
    └── utils/                  # 工具函数
        ├── json-extractor.ts
        ├── text-chunker.ts
        └── content-extractor.ts
```

### 3.2 Modern.js BFF 集成

```typescript
// modern.config.ts
export default defineConfig({
  bff: {
    prefix: '/api',
    // lambda 目录保持在 api/presentation/lambda
    // 但为了兼容现有配置，可以通过软链接或路径映射
  },
});
```

---

## 4. 分层职责

### 4.1 Presentation Layer（表示层）

**职责：**
- 处理 HTTP 请求和响应
- 参数验证和转换
- 调用 Application Layer 的 Use Cases
- 错误处理和日志记录
- SSE 流式响应

**示例：**

```typescript
// api/presentation/lambda/chat.ts
import { CreateMessageUseCase } from '@/application/use-cases/chat/send-message.use-case';
import { ChatRequestDto, ChatResponseDto } from '@/presentation/dto/chat.dto';
import { validateChatRequest } from '@/presentation/validators/chat.validator';

export const POST = async (request: Request): Promise<Response> => {
  try {
    // 1. 验证请求
    const dto: ChatRequestDto = await request.json();
    validateChatRequest(dto);

    // 2. 调用用例
    const useCase = new CreateMessageUseCase(/* 依赖注入 */);
    const result = await useCase.execute({
      userId: dto.userId,
      message: dto.message,
      modelType: dto.modelType,
    });

    // 3. 返回响应
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return handleError(error);
  }
};
```

---

### 4.2 Application Layer（应用层）

**职责：**
- 定义业务用例（Use Cases）
- 编排多个领域服务和 Repository
- 事务管理
- 业务流程协调

**示例：**

```typescript
// api/application/use-cases/chat/send-message.use-case.ts
export class SendMessageUseCase {
  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly messageRepo: IMessageRepository,
    private readonly llmService: ILLMService,
    private readonly memoryService: IMemoryService,
  ) {}

  async execute(input: SendMessageInput): Promise<SendMessageOutput> {
    // 1. 获取会话上下文
    const conversation = await this.conversationRepo.findById(input.conversationId);
    if (!conversation) {
      throw new ConversationNotFoundException();
    }

    // 2. 保存用户消息
    const userMessage = await this.messageRepo.save({
      conversationId: input.conversationId,
      role: 'user',
      content: input.message,
    });

    // 3. 获取对话历史
    const history = await this.memoryService.getHistory(input.conversationId);

    // 4. 调用 LLM
    const aiResponse = await this.llmService.chat({
      messages: [...history, userMessage],
      model: input.modelType,
    });

    // 5. 保存 AI 响应
    const assistantMessage = await this.messageRepo.save({
      conversationId: input.conversationId,
      role: 'assistant',
      content: aiResponse.content,
    });

    return {
      userMessage,
      assistantMessage,
    };
  }
}
```

---

### 4.3 Domain Layer（领域层）

**职责：**
- 定义核心业务实体
- 业务规则和验证
- 领域事件
- 不依赖外部框架

**示例：**

```typescript
// api/domain/entities/message.entity.ts
export class MessageEntity {
  private constructor(
    public readonly id: string,
    public readonly conversationId: string,
    public readonly userId: string,
    public readonly role: 'user' | 'assistant',
    private _content: string,
    public readonly timestamp: Date,
  ) {
    this.validate();
  }

  // 工厂方法
  static create(props: CreateMessageProps): MessageEntity {
    return new MessageEntity(
      uuid(),
      props.conversationId,
      props.userId,
      props.role,
      props.content,
      new Date(),
    );
  }

  // 业务规则
  private validate(): void {
    if (!this._content || this._content.trim().length === 0) {
      throw new InvalidMessageException('Message content cannot be empty');
    }

    if (this._content.length > 100000) {
      throw new InvalidMessageException('Message content too long');
    }
  }

  // 业务方法
  updateContent(newContent: string): void {
    this._content = newContent;
    this.validate();
  }

  get content(): string {
    return this._content;
  }

  // 领域事件
  toPersistence() {
    return {
      messageId: this.id,
      conversationId: this.conversationId,
      userId: this.userId,
      role: this.role,
      content: this._content,
      timestamp: this.timestamp,
    };
  }
}
```

---

### 4.4 Infrastructure Layer（基础设施层）

**职责：**
- 实现 Repository 接口
- 数据库访问
- 外部服务调用
- AI Agent 和工具实现

**示例：**

```typescript
// api/infrastructure/database/mongodb/repositories/message.repository.ts
export class MongoMessageRepository implements IMessageRepository {
  constructor(private readonly db: Db) {}

  async save(message: MessageEntity): Promise<void> {
    const collection = this.db.collection('messages');
    await collection.insertOne(message.toPersistence());
  }

  async findById(id: string): Promise<MessageEntity | null> {
    const collection = this.db.collection('messages');
    const doc = await collection.findOne({ messageId: id });
    
    if (!doc) return null;

    return MessageEntity.create({
      id: doc.messageId,
      conversationId: doc.conversationId,
      userId: doc.userId,
      role: doc.role,
      content: doc.content,
      timestamp: doc.timestamp,
    });
  }

  async findByConversationId(conversationId: string): Promise<MessageEntity[]> {
    const collection = this.db.collection('messages');
    const docs = await collection
      .find({ conversationId })
      .sort({ timestamp: 1 })
      .toArray();

    return docs.map(doc => MessageEntity.create({
      id: doc.messageId,
      conversationId: doc.conversationId,
      userId: doc.userId,
      role: doc.role,
      content: doc.content,
      timestamp: doc.timestamp,
    }));
  }
}
```

---

## 5. 实施步骤

### Phase 1: 准备阶段（1-2天）

#### Step 1.1: 创建新目录结构
```bash
mkdir -p api/{presentation,application,domain,infrastructure,shared}
mkdir -p api/presentation/{dto,validators,middleware}
mkdir -p api/application/{use-cases,services,interfaces}
mkdir -p api/domain/{entities,value-objects,services,events,exceptions}
mkdir -p api/infrastructure/{database,external-services,ai-agents,tools,streaming}
mkdir -p api/shared/{config,constants,types,utils}
```

#### Step 1.2: 定义接口和类型
- 创建 Repository 接口
- 创建 Service 接口
- 定义 DTO 和实体类型

#### Step 1.3: 配置依赖注入容器
```typescript
// api/shared/container/di-container.ts
import { Container } from 'inversify';

export const container = new Container();

// 注册 Repository
container.bind<IConversationRepository>('ConversationRepository')
  .to(MongoConversationRepository);

// 注册 Service
container.bind<ILLMService>('LLMService')
  .to(VolcengineService);
```

---

### Phase 2: 迁移核心功能（3-5天）

#### Step 2.1: 迁移数据访问层
- [ ] 迁移 `api/db/models.ts` → `api/domain/entities/`
- [ ] 创建 Repository 实现 → `api/infrastructure/database/mongodb/repositories/`
- [ ] 测试数据库连接和 CRUD 操作

#### Step 2.2: 迁移服务层
- [ ] 迁移 `api/services/conversationService.ts` → Application Use Cases
- [ ] 迁移 `api/services/messageService.ts` → Application Use Cases
- [ ] 迁移 `api/services/volcengineService.ts` → Infrastructure External Services

#### Step 2.3: 迁移 API 路由
- [ ] 保持 `api/lambda/` 在原位置（Modern.js BFF 要求）
- [ ] 重构路由代码，调用新的 Use Cases
- [ ] 添加参数验证和错误处理

---

### Phase 3: 迁移 AI 功能（3-5天）

#### Step 3.1: 迁移 AI Agents
- [ ] 迁移 `api/agents/` → `api/infrastructure/ai-agents/`
- [ ] 重构为实现统一接口
- [ ] 添加 Agent 工厂模式

#### Step 3.2: 迁移工具和工作流
- [ ] 迁移 `api/tools/` → `api/infrastructure/tools/`
- [ ] 迁移 `api/workflows/` → Application Services

#### Step 3.3: 迁移流式处理
- [ ] 迁移 `api/handlers/` → `api/infrastructure/streaming/`
- [ ] 统一 SSE 处理逻辑

---

### Phase 4: 优化和测试（2-3天）

#### Step 4.1: 添加单元测试
- Domain Layer 单元测试
- Application Layer 集成测试
- Repository 测试

#### Step 4.2: 性能优化
- 添加缓存策略
- 优化数据库查询
- 添加监控和日志

#### Step 4.3: 文档更新
- API 文档
- 架构文档
- 开发指南

---

## 6. 迁移策略

### 6.1 增量迁移原则

```
旧代码（保持运行） ──→ 新架构（逐步替换） ──→ 删除旧代码
    ↓                      ↓                     ↓
  稳定                   测试通过               清理完成
```

### 6.2 双写策略

在迁移过程中，可以使用 **Adapter 模式** 兼容新旧代码：

```typescript
// 旧服务适配器
class LegacyConversationServiceAdapter implements IConversationRepository {
  constructor(private legacyService: ConversationService) {}

  async findById(id: string) {
    // 调用旧服务
    const result = await this.legacyService.getConversation(id);
    // 转换为新实体
    return ConversationEntity.fromLegacy(result);
  }
}
```

### 6.3 功能开关

使用环境变量控制新旧功能切换：

```typescript
// .env
USE_NEW_ARCHITECTURE=true

// 代码中
if (process.env.USE_NEW_ARCHITECTURE === 'true') {
  // 使用新架构
  return newConversationService.create();
} else {
  // 使用旧代码
  return legacyService.createConversation();
}
```

---

## 7. 技术栈与工具

### 7.1 依赖注入
```bash
npm install inversify reflect-metadata
```

### 7.2 验证库
```bash
npm install zod  # 或 joi, class-validator
```

### 7.3 测试框架
```bash
npm install -D vitest @vitest/ui
```

### 7.4 类型定义
```typescript
// tsconfig.json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "paths": {
      "@/presentation/*": ["api/presentation/*"],
      "@/application/*": ["api/application/*"],
      "@/domain/*": ["api/domain/*"],
      "@/infrastructure/*": ["api/infrastructure/*"],
      "@/shared/*": ["api/shared/*"]
    }
  }
}
```

---

## 8. 重构检查清单

### ✅ 架构检查
- [ ] 每一层职责清晰
- [ ] 依赖方向正确（内层不依赖外层）
- [ ] 核心业务逻辑在 Domain Layer
- [ ] 接口定义在 Application Layer

### ✅ 代码质量检查
- [ ] 所有类单一职责
- [ ] 函数长度 < 30 行
- [ ] 循环复杂度 < 10
- [ ] 测试覆盖率 > 80%

### ✅ 性能检查
- [ ] 数据库查询优化
- [ ] 缓存策略合理
- [ ] 没有 N+1 查询问题

### ✅ 安全检查
- [ ] 输入验证完善
- [ ] SQL 注入防护
- [ ] 敏感数据加密

---

## 9. 预期收益

### 9.1 可维护性提升
- ✅ 代码结构清晰，新人上手快
- ✅ 修改影响范围可控
- ✅ 便于 Code Review

### 9.2 可扩展性提升
- ✅ 新功能接入简单
- ✅ 支持多数据源切换
- ✅ 支持多 LLM 模型切换

### 9.3 可测试性提升
- ✅ 单元测试容易编写
- ✅ Mock 外部依赖方便
- ✅ 集成测试覆盖全面

---

## 10. 注意事项

### ⚠️ 不要过度设计
- 不是所有功能都需要 Entity/Value Object
- 简单的 CRUD 可以直接用 DTO
- 根据实际复杂度调整

### ⚠️ 渐进式重构
- 不要一次性重写所有代码
- 优先重构核心业务逻辑
- 保持系统可运行状态

### ⚠️ 保持团队一致
- 统一代码风格
- 统一命名规范
- 定期代码审查

---

## 11. 下一步行动

1. **Review 本方案**，与团队讨论确认
2. **创建新目录结构**，定义接口
3. **选择一个小模块试点**（推荐：Conversation 管理）
4. **逐步迁移其他模块**
5. **清理旧代码，完善文档**

---

## 参考资料

- [eShopOnWeb GitHub](https://github.com/dotnet-architecture/eShopOnWeb)
- [Architecting Modern Web Applications with ASP.NET Core](https://docs.microsoft.com/dotnet/architecture/modern-web-apps-azure/)
- [Clean Architecture by Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Modern.js BFF Documentation](https://modernjs.dev/guides/features/server-side/bff/function.html)
- [Domain-Driven Design Reference](https://domainlanguage.com/ddd/reference/)

---

**最后更新：** 2025-01-01
**维护人：** AI Agent Team

