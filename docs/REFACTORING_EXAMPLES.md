# 重构示例代码

## 📋 目录
- [1. 领域层示例](#1-领域层示例)
- [2. 应用层示例](#2-应用层示例)
- [3. 基础设施层示例](#3-基础设施层示例)
- [4. 表示层示例](#4-表示层示例)
- [5. 依赖注入配置](#5-依赖注入配置)

---

## 1. 领域层示例

### 1.1 实体定义

```typescript
// api/domain/entities/conversation.entity.ts

import { v4 as uuid } from 'uuid';
import { ConversationCreatedEvent } from '../events/conversation-created.event';
import { InvalidConversationException } from '../exceptions/invalid-conversation.exception';

export interface ConversationProps {
  id?: string;
  userId: string;
  title: string;
  createdAt?: Date;
  updatedAt?: Date;
  messageCount?: number;
  isActive?: boolean;
}

export class ConversationEntity {
  private readonly _id: string;
  private readonly _userId: string;
  private _title: string;
  private readonly _createdAt: Date;
  private _updatedAt: Date;
  private _messageCount: number;
  private _isActive: boolean;
  private _domainEvents: any[] = [];

  private constructor(props: ConversationProps) {
    this._id = props.id || uuid();
    this._userId = props.userId;
    this._title = props.title;
    this._createdAt = props.createdAt || new Date();
    this._updatedAt = props.updatedAt || new Date();
    this._messageCount = props.messageCount || 0;
    this._isActive = props.isActive ?? true;

    this.validate();
  }

  // 工厂方法 - 创建新会话
  static create(userId: string, title?: string): ConversationEntity {
    const conversation = new ConversationEntity({
      userId,
      title: title || '新对话',
    });

    // 添加领域事件
    conversation.addDomainEvent(
      new ConversationCreatedEvent(conversation._id, userId)
    );

    return conversation;
  }

  // 工厂方法 - 从持久化数据重建
  static fromPersistence(data: any): ConversationEntity {
    return new ConversationEntity({
      id: data.conversationId,
      userId: data.userId,
      title: data.title,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      messageCount: data.messageCount,
      isActive: data.isActive,
    });
  }

  // 业务规则验证
  private validate(): void {
    if (!this._userId) {
      throw new InvalidConversationException('User ID is required');
    }

    if (!this._title || this._title.trim().length === 0) {
      throw new InvalidConversationException('Title cannot be empty');
    }

    if (this._title.length > 200) {
      throw new InvalidConversationException('Title too long (max 200 chars)');
    }
  }

  // 业务方法
  updateTitle(newTitle: string): void {
    if (!newTitle || newTitle.trim().length === 0) {
      throw new InvalidConversationException('Title cannot be empty');
    }

    this._title = newTitle.trim();
    this._updatedAt = new Date();
  }

  incrementMessageCount(): void {
    this._messageCount++;
    this._updatedAt = new Date();
  }

  archive(): void {
    this._isActive = false;
    this._updatedAt = new Date();
  }

  restore(): void {
    this._isActive = true;
    this._updatedAt = new Date();
  }

  // 转换为持久化格式
  toPersistence() {
    return {
      conversationId: this._id,
      userId: this._userId,
      title: this._title,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
      messageCount: this._messageCount,
      isActive: this._isActive,
    };
  }

  // Getters
  get id(): string { return this._id; }
  get userId(): string { return this._userId; }
  get title(): string { return this._title; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }
  get messageCount(): number { return this._messageCount; }
  get isActive(): boolean { return this._isActive; }

  // 领域事件管理
  private addDomainEvent(event: any): void {
    this._domainEvents.push(event);
  }

  getDomainEvents(): any[] {
    return [...this._domainEvents];
  }

  clearDomainEvents(): void {
    this._domainEvents = [];
  }
}
```

### 1.2 值对象

```typescript
// api/domain/value-objects/message-content.vo.ts

import { InvalidMessageException } from '../exceptions/invalid-message.exception';

export class MessageContent {
  private readonly _value: string;
  private readonly _length: number;
  private readonly _preview: string;

  private constructor(content: string) {
    this._value = content;
    this._length = content.length;
    this._preview = this.generatePreview(content);
    
    this.validate();
  }

  static create(content: string): MessageContent {
    return new MessageContent(content);
  }

  private validate(): void {
    if (!this._value || this._value.trim().length === 0) {
      throw new InvalidMessageException('Message content cannot be empty');
    }

    if (this._length > 100000) {
      throw new InvalidMessageException('Message content too long (max 100,000 chars)');
    }
  }

  private generatePreview(content: string): string {
    const maxPreviewLength = 1000;
    if (content.length <= maxPreviewLength) {
      return content;
    }
    return content.substring(0, maxPreviewLength) + '...';
  }

  get value(): string {
    return this._value;
  }

  get length(): number {
    return this._length;
  }

  get preview(): string {
    return this._preview;
  }

  needsChunking(): boolean {
    return this._length > 50000;
  }

  equals(other: MessageContent): boolean {
    return this._value === other._value;
  }
}
```

---

## 2. 应用层示例

### 2.1 Repository 接口定义

```typescript
// api/application/interfaces/repositories/conversation.repository.interface.ts

import { ConversationEntity } from '@/domain/entities/conversation.entity';

export interface IConversationRepository {
  /**
   * 保存会话（创建或更新）
   */
  save(conversation: ConversationEntity): Promise<void>;

  /**
   * 根据 ID 查找会话
   */
  findById(id: string): Promise<ConversationEntity | null>;

  /**
   * 根据用户 ID 查找所有会话
   */
  findByUserId(userId: string, options?: {
    limit?: number;
    offset?: number;
    includeInactive?: boolean;
  }): Promise<ConversationEntity[]>;

  /**
   * 删除会话
   */
  delete(id: string): Promise<void>;

  /**
   * 统计用户的会话数量
   */
  countByUserId(userId: string): Promise<number>;
}
```

### 2.2 Use Case 实现

```typescript
// api/application/use-cases/conversation/create-conversation.use-case.ts

import { ConversationEntity } from '@/domain/entities/conversation.entity';
import { IConversationRepository } from '@/application/interfaces/repositories/conversation.repository.interface';
import { IUserRepository } from '@/application/interfaces/repositories/user.repository.interface';
import { UserNotFoundException } from '@/domain/exceptions/user-not-found.exception';

export interface CreateConversationInput {
  userId: string;
  title?: string;
}

export interface CreateConversationOutput {
  conversationId: string;
  userId: string;
  title: string;
  createdAt: Date;
}

export class CreateConversationUseCase {
  constructor(
    private readonly conversationRepository: IConversationRepository,
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(input: CreateConversationInput): Promise<CreateConversationOutput> {
    // 1. 验证用户存在
    const user = await this.userRepository.findById(input.userId);
    if (!user) {
      throw new UserNotFoundException(`User ${input.userId} not found`);
    }

    // 2. 创建会话实体（领域逻辑）
    const conversation = ConversationEntity.create(
      input.userId,
      input.title,
    );

    // 3. 持久化
    await this.conversationRepository.save(conversation);

    // 4. 处理领域事件（如果需要）
    const events = conversation.getDomainEvents();
    for (const event of events) {
      // 发布事件到事件总线
      // await this.eventBus.publish(event);
    }
    conversation.clearDomainEvents();

    // 5. 返回结果
    return {
      conversationId: conversation.id,
      userId: conversation.userId,
      title: conversation.title,
      createdAt: conversation.createdAt,
    };
  }
}
```

### 2.3 应用服务（跨用例协调）

```typescript
// api/application/services/chat-orchestration.service.ts

import { SendMessageUseCase } from '../use-cases/chat/send-message.use-case';
import { SaveMessageUseCase } from '../use-cases/message/save-message.use-case';
import { UpdateConversationUseCase } from '../use-cases/conversation/update-conversation.use-case';
import { ILLMService } from '../interfaces/services/llm.service.interface';
import { IMemoryService } from '../interfaces/services/memory.service.interface';

export class ChatOrchestrationService {
  constructor(
    private readonly sendMessageUseCase: SendMessageUseCase,
    private readonly saveMessageUseCase: SaveMessageUseCase,
    private readonly updateConversationUseCase: UpdateConversationUseCase,
    private readonly llmService: ILLMService,
    private readonly memoryService: IMemoryService,
  ) {}

  /**
   * 处理完整的聊天流程
   */
  async handleChat(input: {
    userId: string;
    conversationId: string;
    message: string;
    modelType: 'local' | 'volcano';
  }): Promise<{
    userMessageId: string;
    assistantMessageId: string;
    assistantContent: string;
  }> {
    // 1. 保存用户消息
    const userMessage = await this.saveMessageUseCase.execute({
      conversationId: input.conversationId,
      userId: input.userId,
      role: 'user',
      content: input.message,
    });

    // 2. 获取对话历史
    const history = await this.memoryService.getHistory(input.conversationId);

    // 3. 调用 LLM
    const aiResponse = await this.llmService.chat({
      messages: [...history, { role: 'user', content: input.message }],
      model: input.modelType,
    });

    // 4. 保存 AI 响应
    const assistantMessage = await this.saveMessageUseCase.execute({
      conversationId: input.conversationId,
      userId: input.userId,
      role: 'assistant',
      content: aiResponse.content,
      thinking: aiResponse.thinking,
    });

    // 5. 更新会话统计
    await this.updateConversationUseCase.execute({
      conversationId: input.conversationId,
      incrementMessageCount: 2, // user + assistant
    });

    return {
      userMessageId: userMessage.messageId,
      assistantMessageId: assistantMessage.messageId,
      assistantContent: aiResponse.content,
    };
  }
}
```

---

## 3. 基础设施层示例

### 3.1 Repository 实现

```typescript
// api/infrastructure/database/mongodb/repositories/conversation.repository.ts

import { Db } from 'mongodb';
import { ConversationEntity } from '@/domain/entities/conversation.entity';
import { IConversationRepository } from '@/application/interfaces/repositories/conversation.repository.interface';

export class MongoConversationRepository implements IConversationRepository {
  private readonly collectionName = 'conversations';

  constructor(private readonly db: Db) {}

  async save(conversation: ConversationEntity): Promise<void> {
    const collection = this.db.collection(this.collectionName);
    const data = conversation.toPersistence();

    await collection.updateOne(
      { conversationId: data.conversationId },
      { $set: data },
      { upsert: true }
    );
  }

  async findById(id: string): Promise<ConversationEntity | null> {
    const collection = this.db.collection(this.collectionName);
    const doc = await collection.findOne({ conversationId: id });

    if (!doc) {
      return null;
    }

    return ConversationEntity.fromPersistence(doc);
  }

  async findByUserId(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      includeInactive?: boolean;
    } = {}
  ): Promise<ConversationEntity[]> {
    const collection = this.db.collection(this.collectionName);
    
    const query: any = { userId };
    if (!options.includeInactive) {
      query.isActive = true;
    }

    const docs = await collection
      .find(query)
      .sort({ updatedAt: -1 })
      .skip(options.offset || 0)
      .limit(options.limit || 50)
      .toArray();

    return docs.map(doc => ConversationEntity.fromPersistence(doc));
  }

  async delete(id: string): Promise<void> {
    const collection = this.db.collection(this.collectionName);
    await collection.deleteOne({ conversationId: id });
  }

  async countByUserId(userId: string): Promise<number> {
    const collection = this.db.collection(this.collectionName);
    return await collection.countDocuments({ userId, isActive: true });
  }
}
```

### 3.2 外部服务实现

```typescript
// api/infrastructure/external-services/llm/volcengine.service.ts

import { ILLMService, ChatInput, ChatOutput } from '@/application/interfaces/services/llm.service.interface';

export class VolcengineService implements ILLMService {
  private readonly apiKey: string;
  private readonly endpoint: string;

  constructor(config: { apiKey: string; endpoint: string }) {
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint;
  }

  async chat(input: ChatInput): Promise<ChatOutput> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: input.model,
          messages: input.messages,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Volcengine API error: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        content: data.choices[0].message.content,
        thinking: data.thinking,
        tokens: data.usage?.total_tokens,
      };
    } catch (error) {
      console.error('Volcengine service error:', error);
      throw error;
    }
  }

  async streamChat(input: ChatInput): AsyncGenerator<string, void, unknown> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Volcengine API error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const json = JSON.parse(data);
            const content = json.choices[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch (e) {
            console.error('Parse error:', e);
          }
        }
      }
    }
  }
}
```

---

## 4. 表示层示例

### 4.1 DTO 定义

```typescript
// api/presentation/dto/chat.dto.ts

import { z } from 'zod';

// 请求 DTO Schema
export const ChatRequestSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  conversationId: z.string().uuid('Invalid conversation ID format').optional(),
  message: z.string()
    .min(1, 'Message cannot be empty')
    .max(100000, 'Message too long'),
  modelType: z.enum(['local', 'volcano']).default('volcano'),
});

export type ChatRequestDto = z.infer<typeof ChatRequestSchema>;

// 响应 DTO
export interface ChatResponseDto {
  success: boolean;
  data?: {
    conversationId: string;
    userMessageId: string;
    assistantMessageId: string;
    assistantContent: string;
  };
  error?: {
    code: string;
    message: string;
  };
}
```

### 4.2 验证器

```typescript
// api/presentation/validators/chat.validator.ts

import { ChatRequestSchema, ChatRequestDto } from '../dto/chat.dto';
import { ValidationException } from '@/domain/exceptions/validation.exception';

export function validateChatRequest(data: unknown): ChatRequestDto {
  try {
    return ChatRequestSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      throw new ValidationException(`Validation failed: ${messages.join(', ')}`);
    }
    throw error;
  }
}
```

### 4.3 BFF API 路由

```typescript
// api/presentation/lambda/chat.ts

import { CreateConversationUseCase } from '@/application/use-cases/conversation/create-conversation.use-case';
import { ChatOrchestrationService } from '@/application/services/chat-orchestration.service';
import { validateChatRequest } from '@/presentation/validators/chat.validator';
import { ChatRequestDto, ChatResponseDto } from '@/presentation/dto/chat.dto';
import { container } from '@/shared/container/di-container';

/**
 * POST /api/chat
 * 处理聊天请求
 */
export const POST = async (request: Request): Promise<Response> => {
  try {
    // 1. 解析和验证请求
    const body = await request.json();
    const dto: ChatRequestDto = validateChatRequest(body);

    // 2. 从容器获取服务
    const chatService = container.get<ChatOrchestrationService>('ChatOrchestrationService');
    const createConversationUseCase = container.get<CreateConversationUseCase>('CreateConversationUseCase');

    // 3. 如果没有提供 conversationId，创建新会话
    let conversationId = dto.conversationId;
    if (!conversationId) {
      const conversation = await createConversationUseCase.execute({
        userId: dto.userId,
        title: '新对话',
      });
      conversationId = conversation.conversationId;
    }

    // 4. 处理聊天
    const result = await chatService.handleChat({
      userId: dto.userId,
      conversationId,
      message: dto.message,
      modelType: dto.modelType,
    });

    // 5. 返回响应
    const response: ChatResponseDto = {
      success: true,
      data: {
        conversationId,
        userMessageId: result.userMessageId,
        assistantMessageId: result.assistantMessageId,
        assistantContent: result.assistantContent,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Chat API error:', error);

    const response: ChatResponseDto = {
      success: false,
      error: {
        code: error.name || 'INTERNAL_ERROR',
        message: error.message || 'An unexpected error occurred',
      },
    };

    return new Response(JSON.stringify(response), {
      status: error.status || 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

---

## 5. 依赖注入配置

### 5.1 DI 容器设置

```typescript
// api/shared/container/di-container.ts

import { Container } from 'inversify';
import 'reflect-metadata';

// Interfaces
import { IConversationRepository } from '@/application/interfaces/repositories/conversation.repository.interface';
import { IMessageRepository } from '@/application/interfaces/repositories/message.repository.interface';
import { IUserRepository } from '@/application/interfaces/repositories/user.repository.interface';
import { ILLMService } from '@/application/interfaces/services/llm.service.interface';
import { ICacheService } from '@/application/interfaces/services/cache.service.interface';

// Implementations
import { MongoConversationRepository } from '@/infrastructure/database/mongodb/repositories/conversation.repository';
import { MongoMessageRepository } from '@/infrastructure/database/mongodb/repositories/message.repository';
import { MongoUserRepository } from '@/infrastructure/database/mongodb/repositories/user.repository';
import { VolcengineService } from '@/infrastructure/external-services/llm/volcengine.service';
import { RedisService } from '@/infrastructure/database/redis/cache.service';

// Use Cases
import { CreateConversationUseCase } from '@/application/use-cases/conversation/create-conversation.use-case';
import { SendMessageUseCase } from '@/application/use-cases/chat/send-message.use-case';

// Services
import { ChatOrchestrationService } from '@/application/services/chat-orchestration.service';

// Database
import { getDatabase } from '@/infrastructure/database/mongodb/connection';
import { getRedisClient } from '@/infrastructure/database/redis/client';

// 创建容器
export const container = new Container();

// ==================== 数据库连接 ====================
container.bind('MongoDB').toDynamicValue(() => getDatabase()).inSingletonScope();
container.bind('RedisClient').toDynamicValue(() => getRedisClient()).inSingletonScope();

// ==================== Repositories ====================
container.bind<IConversationRepository>('ConversationRepository')
  .toDynamicValue((context) => {
    const db = context.container.get('MongoDB');
    return new MongoConversationRepository(db);
  })
  .inSingletonScope();

container.bind<IMessageRepository>('MessageRepository')
  .toDynamicValue((context) => {
    const db = context.container.get('MongoDB');
    return new MongoMessageRepository(db);
  })
  .inSingletonScope();

container.bind<IUserRepository>('UserRepository')
  .toDynamicValue((context) => {
    const db = context.container.get('MongoDB');
    return new MongoUserRepository(db);
  })
  .inSingletonScope();

// ==================== External Services ====================
container.bind<ILLMService>('LLMService')
  .toDynamicValue(() => {
    return new VolcengineService({
      apiKey: process.env.VOLCENGINE_API_KEY!,
      endpoint: process.env.VOLCENGINE_ENDPOINT!,
    });
  })
  .inSingletonScope();

container.bind<ICacheService>('CacheService')
  .toDynamicValue((context) => {
    const redis = context.container.get('RedisClient');
    return new RedisService(redis);
  })
  .inSingletonScope();

// ==================== Use Cases ====================
container.bind<CreateConversationUseCase>('CreateConversationUseCase')
  .toDynamicValue((context) => {
    return new CreateConversationUseCase(
      context.container.get('ConversationRepository'),
      context.container.get('UserRepository'),
    );
  });

container.bind<SendMessageUseCase>('SendMessageUseCase')
  .toDynamicValue((context) => {
    return new SendMessageUseCase(
      context.container.get('ConversationRepository'),
      context.container.get('MessageRepository'),
      context.container.get('LLMService'),
      context.container.get('CacheService'),
    );
  });

// ==================== Application Services ====================
container.bind<ChatOrchestrationService>('ChatOrchestrationService')
  .toDynamicValue((context) => {
    return new ChatOrchestrationService(
      context.container.get('SendMessageUseCase'),
      context.container.get('SaveMessageUseCase'),
      context.container.get('UpdateConversationUseCase'),
      context.container.get('LLMService'),
      context.container.get('MemoryService'),
    );
  });

export default container;
```

### 5.2 装饰器版本（可选）

```typescript
// api/shared/container/decorators.ts

import { injectable, inject } from 'inversify';
import 'reflect-metadata';

// 使用装饰器简化依赖注入
@injectable()
export class CreateConversationUseCase {
  constructor(
    @inject('ConversationRepository') private conversationRepo: IConversationRepository,
    @inject('UserRepository') private userRepo: IUserRepository,
  ) {}

  async execute(input: CreateConversationInput): Promise<CreateConversationOutput> {
    // ... 实现
  }
}
```

---

## 6. 测试示例

### 6.1 单元测试（Domain Layer）

```typescript
// api/domain/entities/__tests__/conversation.entity.spec.ts

import { describe, it, expect } from 'vitest';
import { ConversationEntity } from '../conversation.entity';
import { InvalidConversationException } from '../../exceptions/invalid-conversation.exception';

describe('ConversationEntity', () => {
  describe('create', () => {
    it('should create a valid conversation', () => {
      const userId = 'user-123';
      const title = 'Test Conversation';

      const conversation = ConversationEntity.create(userId, title);

      expect(conversation.userId).toBe(userId);
      expect(conversation.title).toBe(title);
      expect(conversation.isActive).toBe(true);
      expect(conversation.messageCount).toBe(0);
    });

    it('should use default title when not provided', () => {
      const conversation = ConversationEntity.create('user-123');
      expect(conversation.title).toBe('新对话');
    });

    it('should throw error when userId is empty', () => {
      expect(() => ConversationEntity.create('')).toThrow(InvalidConversationException);
    });

    it('should throw error when title is too long', () => {
      const longTitle = 'a'.repeat(201);
      expect(() => ConversationEntity.create('user-123', longTitle))
        .toThrow(InvalidConversationException);
    });
  });

  describe('updateTitle', () => {
    it('should update title successfully', () => {
      const conversation = ConversationEntity.create('user-123', 'Old Title');
      const newTitle = 'New Title';

      conversation.updateTitle(newTitle);

      expect(conversation.title).toBe(newTitle);
    });

    it('should throw error when new title is empty', () => {
      const conversation = ConversationEntity.create('user-123');
      expect(() => conversation.updateTitle('')).toThrow(InvalidConversationException);
    });
  });

  describe('incrementMessageCount', () => {
    it('should increment message count', () => {
      const conversation = ConversationEntity.create('user-123');
      
      conversation.incrementMessageCount();
      expect(conversation.messageCount).toBe(1);

      conversation.incrementMessageCount();
      expect(conversation.messageCount).toBe(2);
    });
  });

  describe('archive and restore', () => {
    it('should archive conversation', () => {
      const conversation = ConversationEntity.create('user-123');
      
      conversation.archive();
      
      expect(conversation.isActive).toBe(false);
    });

    it('should restore archived conversation', () => {
      const conversation = ConversationEntity.create('user-123');
      conversation.archive();
      
      conversation.restore();
      
      expect(conversation.isActive).toBe(true);
    });
  });
});
```

### 6.2 集成测试（Use Case）

```typescript
// api/application/use-cases/__tests__/create-conversation.use-case.spec.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreateConversationUseCase } from '../conversation/create-conversation.use-case';
import { IConversationRepository } from '../../interfaces/repositories/conversation.repository.interface';
import { IUserRepository } from '../../interfaces/repositories/user.repository.interface';
import { UserNotFoundException } from '@/domain/exceptions/user-not-found.exception';

describe('CreateConversationUseCase', () => {
  let useCase: CreateConversationUseCase;
  let mockConversationRepo: IConversationRepository;
  let mockUserRepo: IUserRepository;

  beforeEach(() => {
    // 创建 mock repositories
    mockConversationRepo = {
      save: vi.fn(),
      findById: vi.fn(),
      findByUserId: vi.fn(),
      delete: vi.fn(),
      countByUserId: vi.fn(),
    };

    mockUserRepo = {
      findById: vi.fn(),
      save: vi.fn(),
    };

    useCase = new CreateConversationUseCase(
      mockConversationRepo,
      mockUserRepo,
    );
  });

  it('should create conversation successfully', async () => {
    const userId = 'user-123';
    const title = 'Test Conversation';

    // Mock user exists
    vi.mocked(mockUserRepo.findById).mockResolvedValue({
      id: userId,
      username: 'testuser',
    });

    const result = await useCase.execute({ userId, title });

    expect(result.userId).toBe(userId);
    expect(result.title).toBe(title);
    expect(mockConversationRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should throw error when user not found', async () => {
    const userId = 'non-existent-user';

    // Mock user not found
    vi.mocked(mockUserRepo.findById).mockResolvedValue(null);

    await expect(useCase.execute({ userId }))
      .rejects.toThrow(UserNotFoundException);

    expect(mockConversationRepo.save).not.toHaveBeenCalled();
  });
});
```

---

## 7. 配置文件

### 7.1 TypeScript 路径别名

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020"],
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "@/presentation/*": ["api/presentation/*"],
      "@/application/*": ["api/application/*"],
      "@/domain/*": ["api/domain/*"],
      "@/infrastructure/*": ["api/infrastructure/*"],
      "@/shared/*": ["api/shared/*"]
    }
  },
  "include": ["api/**/*"],
  "exclude": ["node_modules", "**/*.spec.ts"]
}
```

### 7.2 ESLint 配置

```json
// .eslintrc.json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "max-lines-per-function": ["warn", { "max": 30 }],
    "complexity": ["warn", 10],
    "@typescript-eslint/explicit-function-return-type": "warn",
    "@typescript-eslint/no-explicit-any": "warn"
  }
}
```

---

## 总结

这些示例代码展示了：

1. ✅ **清晰的分层架构**
2. ✅ **依赖注入和接口隔离**
3. ✅ **领域驱动设计的最佳实践**
4. ✅ **完整的测试覆盖**
5. ✅ **符合 SOLID 原则**

使用这些模式，你可以构建一个**易于维护、扩展和测试**的后端系统！

