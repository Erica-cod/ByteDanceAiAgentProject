# Phase 3: Message 模块重构计划

## 🎯 目标

按照 Conversation 模块相同的模式，重构 Message 模块

---

## 📝 步骤清单

### Step 1: Domain Layer

#### 1.1 创建 MessageEntity

```typescript
// api/_clean/domain/entities/message.entity.ts

import { z } from 'zod';

const MessageSchema = z.object({
  messageId: z.string().uuid(),
  conversationId: z.string().uuid(),
  userId: z.string().min(1),
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
  createdAt: z.date(),
  // ... 其他字段
});

export class MessageEntity {
  private constructor(
    public readonly messageId: string,
    public readonly conversationId: string,
    public readonly userId: string,
    public role: 'system' | 'user' | 'assistant',
    public content: string,
    public readonly createdAt: Date,
    // ... 其他属性
  ) {
    MessageSchema.parse({
      messageId,
      conversationId,
      userId,
      role,
      content,
      createdAt,
    });
  }

  static create(
    messageId: string,
    conversationId: string,
    userId: string,
    role: 'system' | 'user' | 'assistant',
    content: string
  ): MessageEntity {
    return new MessageEntity(
      messageId,
      conversationId,
      userId,
      role,
      content,
      new Date()
    );
  }

  static fromPersistence(data: any): MessageEntity {
    return new MessageEntity(
      data.messageId,
      data.conversationId,
      data.userId,
      data.role,
      data.content,
      data.createdAt
    );
  }

  toPersistence() {
    return {
      messageId: this.messageId,
      conversationId: this.conversationId,
      userId: this.userId,
      role: this.role,
      content: this.content,
      createdAt: this.createdAt,
    };
  }

  // 业务规则
  updateContent(newContent: string): void {
    if (!newContent || newContent.trim().length === 0) {
      throw new Error('Content cannot be empty');
    }
    this.content = newContent;
  }

  isOwnedBy(userId: string): boolean {
    return this.userId === userId;
  }
}
```

---

### Step 2: Application Layer

#### 2.1 创建 Repository Interface

```typescript
// api/_clean/application/interfaces/repositories/message.repository.interface.ts

import { MessageEntity } from '../../../domain/entities/message.entity.js';

export interface IMessageRepository {
  save(message: MessageEntity): Promise<void>;
  
  findById(messageId: string, userId: string): Promise<MessageEntity | null>;
  
  findByConversationId(
    conversationId: string,
    userId: string,
    limit: number,
    skip: number
  ): Promise<{
    messages: MessageEntity[];
    total: number;
  }>;
  
  update(message: MessageEntity): Promise<void>;
  
  delete(messageId: string, userId: string): Promise<boolean>;
}
```

#### 2.2 创建 Use Cases

```typescript
// api/_clean/application/use-cases/message/create-message.use-case.ts

import { v4 as uuidv4 } from 'uuid';
import { MessageEntity } from '../../../domain/entities/message.entity.js';
import { IMessageRepository } from '../../interfaces/repositories/message.repository.interface.js';

export class CreateMessageUseCase {
  constructor(
    private readonly messageRepository: IMessageRepository
  ) {}

  async execute(
    conversationId: string,
    userId: string,
    role: 'system' | 'user' | 'assistant',
    content: string
  ): Promise<MessageEntity> {
    const messageId = uuidv4();
    
    const message = MessageEntity.create(
      messageId,
      conversationId,
      userId,
      role,
      content
    );
    
    await this.messageRepository.save(message);
    
    return message;
  }
}
```

```typescript
// api/_clean/application/use-cases/message/get-messages.use-case.ts

import { MessageEntity } from '../../../domain/entities/message.entity.js';
import { IMessageRepository } from '../../interfaces/repositories/message.repository.interface.js';

export class GetMessagesUseCase {
  constructor(
    private readonly messageRepository: IMessageRepository
  ) {}

  async execute(
    conversationId: string,
    userId: string,
    limit: number = 30,
    skip: number = 0
  ): Promise<{
    messages: MessageEntity[];
    total: number;
  }> {
    if (!conversationId) {
      throw new Error('conversationId is required');
    }
    if (!userId) {
      throw new Error('userId is required');
    }
    
    return await this.messageRepository.findByConversationId(
      conversationId,
      userId,
      limit,
      skip
    );
  }
}
```

---

### Step 3: Infrastructure Layer

#### 3.1 实现 Repository

```typescript
// api/_clean/infrastructure/repositories/message.repository.ts

import { MessageEntity } from '../../domain/entities/message.entity.js';
import { IMessageRepository } from '../../application/interfaces/repositories/message.repository.interface.js';
import { getDatabase } from '../../../db/connection.js';
import { Message } from '../../../db/models.js';

export class MessageRepository implements IMessageRepository {
  async save(message: MessageEntity): Promise<void> {
    const data = message.toPersistence();
    const db = await getDatabase();
    const collection = db.collection<Message>('messages');
    
    await collection.insertOne(data as Message);
  }

  async findById(messageId: string, userId: string): Promise<MessageEntity | null> {
    const db = await getDatabase();
    const collection = db.collection<Message>('messages');
    
    const data = await collection.findOne({ messageId, userId });
    
    if (!data) {
      return null;
    }
    
    return MessageEntity.fromPersistence(data);
  }

  async findByConversationId(
    conversationId: string,
    userId: string,
    limit: number,
    skip: number
  ): Promise<{
    messages: MessageEntity[];
    total: number;
  }> {
    const db = await getDatabase();
    const collection = db.collection<Message>('messages');

    const messages = await collection
      .find({ conversationId, userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    const total = await collection.countDocuments({ conversationId, userId });

    const entities = messages.map((data: Message) =>
      MessageEntity.fromPersistence(data)
    );

    return {
      messages: entities,
      total,
    };
  }

  async update(message: MessageEntity): Promise<void> {
    const data = message.toPersistence();
    const db = await getDatabase();
    const collection = db.collection<Message>('messages');
    
    await collection.updateOne(
      { messageId: data.messageId, userId: data.userId },
      { $set: data }
    );
  }

  async delete(messageId: string, userId: string): Promise<boolean> {
    const db = await getDatabase();
    const collection = db.collection<Message>('messages');
    
    const result = await collection.deleteOne({ messageId, userId });
    
    return result.deletedCount > 0;
  }
}
```

---

### Step 4: 更新 DI Container

```typescript
// api/_clean/di-container.ts (新增部分)

import { IMessageRepository } from './application/interfaces/repositories/message.repository.interface.js';
import { MessageRepository } from './infrastructure/repositories/message.repository.js';
import { CreateMessageUseCase } from './application/use-cases/message/create-message.use-case.js';
import { GetMessagesUseCase } from './application/use-cases/message/get-messages.use-case.js';

class SimpleContainer {
  // ... 现有的 Conversation 方法
  
  // Message Repository
  getMessageRepository(): IMessageRepository {
    if (!this.instances.has('MessageRepository')) {
      this.instances.set('MessageRepository', new MessageRepository());
    }
    return this.instances.get('MessageRepository');
  }
  
  // Message Use Cases
  getCreateMessageUseCase(): CreateMessageUseCase {
    const repo = this.getMessageRepository();
    return new CreateMessageUseCase(repo);
  }
  
  getGetMessagesUseCase(): GetMessagesUseCase {
    const repo = this.getMessageRepository();
    return new GetMessagesUseCase(repo);
  }
}
```

---

### Step 5: 更新 API 路由

查看现有的 Message 相关路由，添加架构切换：

```typescript
// api/lambda/conversations/[id].ts (示例)

import { USE_CLEAN_ARCH } from '../_utils/arch-switch.js';
import { getContainer } from '../../_clean/di-container.js';

export async function get({ params, query }) {
  try {
    const { id: conversationId } = params;
    const { userId, limit = '30', skip = '0' } = query;
    
    let messages, total;
    
    if (USE_CLEAN_ARCH) {
      // 🆕 使用新架构
      console.log('🆕 Using Clean Architecture for get messages');
      const container = getContainer();
      const useCase = container.getGetMessagesUseCase();
      const result = await useCase.execute(
        conversationId,
        userId,
        parseInt(limit, 10),
        parseInt(skip, 10)
      );
      
      messages = result.messages.map(entity => entity.toPersistence());
      total = result.total;
    } else {
      // ✅ 使用旧架构
      console.log('✅ Using Legacy Service for get messages');
      const result = await MessageService.getConversationMessages(
        conversationId,
        userId,
        parseInt(limit, 10),
        parseInt(skip, 10)
      );
      
      messages = result.messages;
      total = result.total;
    }
    
    return successResponse({ messages, total });
  } catch (error) {
    return errorResponse(error.message);
  }
}
```

---

### Step 6: 测试

创建测试脚本 `test-message-module.js`：

```javascript
const BASE_URL = 'http://localhost:8080/api';

async function testCreateMessage() {
  // 1. 先创建一个对话
  const convRes = await fetch(`${BASE_URL}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'test_user',
      title: '测试对话'
    })
  });
  const convData = await convRes.json();
  const conversationId = convData.data.conversation.conversationId;
  
  // 2. 创建消息
  const msgRes = await fetch(`${BASE_URL}/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'test_user',
      role: 'user',
      content: '你好，这是测试消息'
    })
  });
  
  const msgData = await msgRes.json();
  console.log('✅ 消息创建成功:', msgData);
  
  // 3. 获取消息列表
  const listRes = await fetch(
    `${BASE_URL}/conversations/${conversationId}?userId=test_user`
  );
  const listData = await listRes.json();
  console.log('✅ 消息列表:', listData.data.messages.length);
}

testCreateMessage();
```

---

## ⏱️ 时间估算

| 任务 | 预计时间 |
|------|----------|
| Step 1: Domain Layer | 1-2 小时 |
| Step 2: Application Layer | 2-3 小时 |
| Step 3: Infrastructure Layer | 2-3 小时 |
| Step 4: DI Container | 30 分钟 |
| Step 5: API Routes | 2-3 小时 |
| Step 6: Testing | 1-2 小时 |
| **总计** | **9-14 小时 (2-3 天)** |

---

## ✅ 验收标准

- [ ] MessageEntity 包含所有业务规则
- [ ] Repository Interface 定义清晰
- [ ] Use Cases 逻辑正确
- [ ] Repository 直接操作数据库
- [ ] API 路由支持双轨切换
- [ ] 旧架构测试通过
- [ ] 新架构测试通过
- [ ] 代码已提交 Git

---

## 🔄 后续模块

按相同模式继续：

1. **User 模块** (2-3天)
2. **Upload 模块** (3-4天)
3. **Device 模块** (1-2天)
4. **Metrics 模块** (1-2天)

---

**创建时间：** 2025-01-01  
**基于：** Conversation 模块成功经验

