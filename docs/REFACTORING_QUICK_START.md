# 快速开始 - 后端重构实施指南

## 🚀 立即开始

本指南将帮助你在 **1 小时内** 完成重构的第一步，并看到实际效果。

---

## 📋 准备工作（10分钟）

### Step 1: 安装依赖

```bash
# 依赖注入框架
npm install inversify reflect-metadata

# 验证库
npm install zod

# 测试框架
npm install -D vitest @vitest/ui
```

### Step 2: 更新 tsconfig.json

```bash
# 备份原文件
cp api/tsconfig.json api/tsconfig.json.backup

# 添加路径别名配置
```

在 `api/tsconfig.json` 中添加：

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "baseUrl": ".",
    "paths": {
      "@/presentation/*": ["presentation/*"],
      "@/application/*": ["application/*"],
      "@/domain/*": ["domain/*"],
      "@/infrastructure/*": ["infrastructure/*"],
      "@/shared/*": ["shared/*"]
    }
  }
}
```

### Step 3: 创建新目录结构

```bash
# 在 api 目录下执行
cd api

# 创建新架构目录
mkdir -p presentation/{dto,validators,middleware}
mkdir -p application/{use-cases,services,interfaces/{repositories,services}}
mkdir -p domain/{entities,value-objects,services,events,exceptions}
mkdir -p infrastructure/{database/{mongodb,redis},external-services/{llm,search},ai-agents,tools,streaming}
mkdir -p shared/{config,constants,types,utils,container}
```

---

## 🎯 第一个重构示例：Conversation 管理（30分钟）

我们将用 **Conversation** 模块作为试点，完整走一遍重构流程。

### Step 1: 定义领域实体（5分钟）

创建 `api/domain/entities/conversation.entity.ts`：

```typescript
import { v4 as uuid } from 'uuid';

export class ConversationEntity {
  private constructor(
    public readonly id: string,
    public readonly userId: string,
    private _title: string,
    public readonly createdAt: Date,
    private _updatedAt: Date,
    private _messageCount: number,
    private _isActive: boolean,
  ) {
    this.validate();
  }

  static create(userId: string, title: string = '新对话'): ConversationEntity {
    return new ConversationEntity(
      uuid(),
      userId,
      title,
      new Date(),
      new Date(),
      0,
      true,
    );
  }

  static fromPersistence(data: any): ConversationEntity {
    return new ConversationEntity(
      data.conversationId,
      data.userId,
      data.title,
      new Date(data.createdAt),
      new Date(data.updatedAt),
      data.messageCount,
      data.isActive,
    );
  }

  private validate(): void {
    if (!this.userId) throw new Error('User ID is required');
    if (!this._title?.trim()) throw new Error('Title cannot be empty');
  }

  updateTitle(newTitle: string): void {
    this._title = newTitle;
    this._updatedAt = new Date();
  }

  incrementMessageCount(): void {
    this._messageCount++;
    this._updatedAt = new Date();
  }

  toPersistence() {
    return {
      conversationId: this.id,
      userId: this.userId,
      title: this._title,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
      messageCount: this._messageCount,
      isActive: this._isActive,
    };
  }

  // Getters
  get title(): string { return this._title; }
  get updatedAt(): Date { return this._updatedAt; }
  get messageCount(): number { return this._messageCount; }
  get isActive(): boolean { return this._isActive; }
}
```

### Step 2: 定义 Repository 接口（3分钟）

创建 `api/application/interfaces/repositories/conversation.repository.interface.ts`：

```typescript
import { ConversationEntity } from '@/domain/entities/conversation.entity';

export interface IConversationRepository {
  save(conversation: ConversationEntity): Promise<void>;
  findById(id: string): Promise<ConversationEntity | null>;
  findByUserId(userId: string, limit?: number): Promise<ConversationEntity[]>;
  delete(id: string): Promise<void>;
}
```

### Step 3: 实现 MongoDB Repository（7分钟）

创建 `api/infrastructure/database/mongodb/repositories/conversation.repository.ts`：

```typescript
import { Db } from 'mongodb';
import { ConversationEntity } from '@/domain/entities/conversation.entity';
import { IConversationRepository } from '@/application/interfaces/repositories/conversation.repository.interface';

export class MongoConversationRepository implements IConversationRepository {
  constructor(private readonly db: Db) {}

  async save(conversation: ConversationEntity): Promise<void> {
    const collection = this.db.collection('conversations');
    const data = conversation.toPersistence();

    await collection.updateOne(
      { conversationId: data.conversationId },
      { $set: data },
      { upsert: true }
    );
  }

  async findById(id: string): Promise<ConversationEntity | null> {
    const collection = this.db.collection('conversations');
    const doc = await collection.findOne({ conversationId: id });

    if (!doc) return null;

    return ConversationEntity.fromPersistence(doc);
  }

  async findByUserId(userId: string, limit: number = 50): Promise<ConversationEntity[]> {
    const collection = this.db.collection('conversations');
    const docs = await collection
      .find({ userId, isActive: true })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray();

    return docs.map(doc => ConversationEntity.fromPersistence(doc));
  }

  async delete(id: string): Promise<void> {
    const collection = this.db.collection('conversations');
    await collection.deleteOne({ conversationId: id });
  }
}
```

### Step 4: 创建 Use Case（7分钟）

创建 `api/application/use-cases/conversation/create-conversation.use-case.ts`：

```typescript
import { ConversationEntity } from '@/domain/entities/conversation.entity';
import { IConversationRepository } from '@/application/interfaces/repositories/conversation.repository.interface';

export interface CreateConversationInput {
  userId: string;
  title?: string;
}

export interface CreateConversationOutput {
  conversationId: string;
  title: string;
  createdAt: Date;
}

export class CreateConversationUseCase {
  constructor(
    private readonly conversationRepository: IConversationRepository,
  ) {}

  async execute(input: CreateConversationInput): Promise<CreateConversationOutput> {
    // 创建领域实体
    const conversation = ConversationEntity.create(
      input.userId,
      input.title,
    );

    // 持久化
    await this.conversationRepository.save(conversation);

    // 返回结果
    return {
      conversationId: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
    };
  }
}
```

### Step 5: 设置依赖注入（5分钟）

创建 `api/shared/container/di-container.ts`：

```typescript
import { Container } from 'inversify';
import 'reflect-metadata';
import { getDatabase } from '../../db/connection'; // 复用现有的数据库连接
import { IConversationRepository } from '@/application/interfaces/repositories/conversation.repository.interface';
import { MongoConversationRepository } from '@/infrastructure/database/mongodb/repositories/conversation.repository';
import { CreateConversationUseCase } from '@/application/use-cases/conversation/create-conversation.use-case';

export const container = new Container();

// 数据库连接
container.bind('MongoDB').toDynamicValue(() => getDatabase()).inSingletonScope();

// Repository
container.bind<IConversationRepository>('ConversationRepository')
  .toDynamicValue((context) => {
    const db = context.container.get('MongoDB');
    return new MongoConversationRepository(db);
  })
  .inSingletonScope();

// Use Case
container.bind<CreateConversationUseCase>('CreateConversationUseCase')
  .toDynamicValue((context) => {
    return new CreateConversationUseCase(
      context.container.get('ConversationRepository'),
    );
  });

export default container;
```

### Step 6: 重构现有 API（3分钟）

**保持** `api/lambda/conversations.ts` 位置不变，但修改实现：

```typescript
// api/lambda/conversations.ts
import { container } from '@/shared/container/di-container';
import { CreateConversationUseCase } from '@/application/use-cases/conversation/create-conversation.use-case';

export const POST = async (request: Request): Promise<Response> => {
  try {
    const body = await request.json();
    
    // 从容器获取 Use Case
    const useCase = container.get<CreateConversationUseCase>('CreateConversationUseCase');
    
    // 执行业务逻辑
    const result = await useCase.execute({
      userId: body.userId,
      title: body.title,
    });

    return new Response(JSON.stringify({
      success: true,
      data: result,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Create conversation error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: {
        message: error.message,
      },
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// GET 请求 - 获取用户的会话列表
export const GET = async (request: Request): Promise<Response> => {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');

    if (!userId) {
      return new Response(JSON.stringify({
        success: false,
        error: { message: 'userId is required' },
      }), { status: 400 });
    }

    const repo = container.get<IConversationRepository>('ConversationRepository');
    const conversations = await repo.findByUserId(userId);

    return new Response(JSON.stringify({
      success: true,
      data: {
        conversations: conversations.map(c => c.toPersistence()),
        total: conversations.length,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({
      success: false,
      error: { message: error.message },
    }), { status: 500 });
  }
};
```

---

## ✅ 测试新架构（10分钟）

### Step 1: 写一个简单的单元测试

创建 `api/domain/entities/__tests__/conversation.entity.spec.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { ConversationEntity } from '../conversation.entity';

describe('ConversationEntity', () => {
  it('should create a valid conversation', () => {
    const userId = 'user-123';
    const title = 'Test Conversation';

    const conversation = ConversationEntity.create(userId, title);

    expect(conversation.userId).toBe(userId);
    expect(conversation.title).toBe(title);
    expect(conversation.isActive).toBe(true);
    expect(conversation.messageCount).toBe(0);
  });

  it('should update title', () => {
    const conversation = ConversationEntity.create('user-123', 'Old Title');
    
    conversation.updateTitle('New Title');
    
    expect(conversation.title).toBe('New Title');
  });

  it('should throw error when userId is empty', () => {
    expect(() => ConversationEntity.create('', 'Title'))
      .toThrow('User ID is required');
  });
});
```

### Step 2: 配置 Vitest

在 `package.json` 中添加：

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui"
  }
}
```

创建 `vitest.config.ts`：

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@/domain': path.resolve(__dirname, './api/domain'),
      '@/application': path.resolve(__dirname, './api/application'),
      '@/infrastructure': path.resolve(__dirname, './api/infrastructure'),
      '@/shared': path.resolve(__dirname, './api/shared'),
    },
  },
});
```

### Step 3: 运行测试

```bash
npm run test
```

你应该看到所有测试通过！✅

---

## 🎉 验证重构效果（10分钟）

### Step 1: 启动应用

```bash
npm run dev
```

### Step 2: 测试新 API

```bash
# 创建会话
curl -X POST http://localhost:8080/api/conversations \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "title": "我的第一个重构测试"
  }'

# 获取会话列表
curl "http://localhost:8080/api/conversations?userId=test-user-123"
```

### Step 3: 对比新旧代码

**旧代码（api/services/conversationService.ts）：**
- ❌ 业务逻辑和数据访问混在一起
- ❌ 难以测试（需要真实数据库）
- ❌ 难以扩展（耦合度高）

**新代码：**
- ✅ 职责清晰：Entity（业务规则）→ Use Case（用例编排）→ Repository（数据访问）
- ✅ 易于测试：可以 Mock Repository
- ✅ 易于扩展：替换实现不影响业务逻辑

---

## 📊 重构对比

| 维度 | 旧架构 | 新架构 |
|------|--------|--------|
| **代码组织** | 按技术分层（services, handlers） | 按业务分层（domain, application） |
| **依赖关系** | 相互依赖，循环引用 | 单向依赖，依赖倒置 |
| **测试难度** | 需要真实数据库和外部服务 | 可以 Mock 所有外部依赖 |
| **可维护性** | 修改影响范围大 | 修改影响局部，易于定位 |
| **可扩展性** | 添加功能需要改多处 | 新增 Use Case 即可 |

---

## 🔄 下一步计划

### 本周任务：完成核心模块重构

- [x] ✅ Conversation 管理（已完成）
- [ ] 🔨 Message 管理（2天）
- [ ] 🔨 User 管理（1天）
- [ ] 🔨 聊天流程（3天）

### 重构 Message 模块（参考 Conversation）

1. 创建 `MessageEntity`
2. 创建 `IMessageRepository`
3. 实现 `MongoMessageRepository`
4. 创建 Use Cases：
   - `SaveMessageUseCase`
   - `GetMessagesUseCase`
   - `GetMessageContentUseCase`
5. 重构 `api/lambda/messages/` 路由

### 重构聊天流程

1. 定义 `ILLMService` 接口
2. 实现 `VolcengineService` 和 `OllamaService`
3. 创建 `ChatOrchestrationService`
4. 创建 Use Cases：
   - `SendMessageUseCase`
   - `StreamChatUseCase`
   - `MultiAgentChatUseCase`
5. 重构 `api/lambda/chat.ts`

---

## 💡 最佳实践提醒

### ✅ DO（推荐做法）

1. **增量迁移**：一次只重构一个模块
2. **保持向后兼容**：旧代码暂时保留，新旧并行
3. **先写测试**：重构前确保有测试覆盖
4. **小步提交**：每完成一个小功能就提交
5. **及时文档**：更新架构文档和 README

### ❌ DON'T（避免的做法）

1. ❌ **一次性重写所有代码**：风险太大
2. ❌ **没有测试就重构**：容易引入 bug
3. ❌ **过度设计**：不是所有功能都需要 Entity
4. ❌ **忽略性能**：重构后要对比性能
5. ❌ **脱离团队**：独自重构，其他人不理解

---

## 🆘 常见问题

### Q1: 为什么 lambda 目录还在原位置？

**A:** Modern.js BFF 要求 API 路由在 `api/lambda/` 目录。我们保持这个约定，但路由内部调用新架构的 Use Cases。

### Q2: 依赖注入会影响性能吗？

**A:** 几乎没有影响。依赖注入主要在应用启动时解析依赖，运行时开销非常小。

### Q3: 旧代码什么时候删除？

**A:** 等新架构完全稳定（建议运行 2-4 周），所有功能测试通过后，再删除旧代码。

### Q4: 如何处理现有的 services 目录？

**A:** 逐步迁移：
1. **纯数据访问逻辑** → Repository
2. **业务编排逻辑** → Use Case
3. **外部服务调用** → Infrastructure Services

### Q5: 是否需要学习 DDD？

**A:** 不需要深入学习 DDD。我们只采用其中实用的部分：
- Entity（领域实体）
- Repository（仓储模式）
- Use Case（用例模式）

---

## 📚 参考资料

- [完整重构方案](./BACKEND_REFACTORING_PLAN.md)
- [代码示例](./REFACTORING_EXAMPLES.md)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Modern.js BFF](https://modernjs.dev/guides/features/server-side/bff/function.html)

---

## ✨ 总结

恭喜！你已经完成了第一个模块的重构：

- ✅ 创建了清晰的分层架构
- ✅ 实现了依赖注入
- ✅ 保持了 BFF API 兼容
- ✅ 添加了单元测试
- ✅ 验证了重构效果

接下来，用同样的方法重构其他模块。每完成一个模块，系统的可维护性就会提升一个台阶！

**记住：重构是一个持续的过程，不是一次性的任务。保持耐心，小步快跑！** 🚀

---

**最后更新：** 2025-01-01

