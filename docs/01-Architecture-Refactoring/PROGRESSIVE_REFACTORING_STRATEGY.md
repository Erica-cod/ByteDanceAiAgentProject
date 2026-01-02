# 渐进式后端重构策略

> **重要教训：** 之前的重构失败是因为太激进。这次我们采用渐进式、无风险的方式。

---

## 🎯 核心原则

### ✅ DO（应该做的）
1. **小步快跑** - 每次只改一小部分
2. **保持运行** - 确保项目随时可以启动
3. **双轨并行** - 新旧代码并存，逐步切换
4. **测试优先** - 重构前先写测试
5. **及时提交** - 每个稳定状态都要 Git 提交

### ❌ DON'T（不应该做的）
1. ❌ 一次性大规模移动文件
2. ❌ 修改 Modern.js 的目录结构预期
3. ❌ 在没有测试的情况下重构
4. ❌ 长时间让项目处于不可运行状态
5. ❌ 修改太多东西后才提交

---

## 📋 重构路线图

### Phase 0: 准备阶段 ✅ (已完成)

**目标：** 确保项目正常运行，文档已保存

- [x] 回滚到稳定版本
- [x] 服务器能正常启动
- [x] 提交重构文档

---

### Phase 1: 建立基础设施（1-2天）

**目标：** 在不影响现有代码的情况下，建立新架构的基础

#### 1.1 创建新架构目录（保持在 `api/` 下）

```
api/
├── lambda/              # ✅ 不动（BFF 路由）
├── services/            # ✅ 不动（现有服务）
├── handlers/            # ✅ 不动（现有处理器）
├── _clean/              # 🆕 新增（Clean Architecture 代码）
    ├── domain/          # 领域层
    │   └── entities/
    ├── application/     # 应用层
    │   ├── interfaces/
    │   └── use-cases/
    └── infrastructure/  # 基础设施层
        └── repositories/
```

**为什么用 `_clean/` 而不是移到外面？**
- Modern.js BFF 会忽略以 `_` 开头的目录
- 代码都在 `api/` 下，路径更简单
- TypeScript 模块解析更容易

#### 1.2 安装依赖（最小化）

只安装真正需要的：
```bash
npm install inversify reflect-metadata zod
```

**不安装测试框架** - 先关注重构本身

#### 1.3 配置 DI 容器

创建 `api/_clean/di-container.ts`（独立于现有代码）

---

### Phase 2: Pilot 模块重构（3-5天）

**选择 Conversation 模块作为试点**

#### 2.1 创建 Domain 层（不影响现有代码）

```typescript
// api/_clean/domain/entities/conversation.entity.ts
export class ConversationEntity {
  // 新的实体类
}
```

#### 2.2 创建 Repository Interface

```typescript
// api/_clean/application/interfaces/conversation.repository.interface.ts
export interface IConversationRepository {
  // 接口定义
}
```

#### 2.3 实现 Repository（包装现有代码）

```typescript
// api/_clean/infrastructure/repositories/conversation.repository.ts
import { ConversationService } from '../../../services/conversationService.js';

export class ConversationRepository implements IConversationRepository {
  // 内部调用现有的 ConversationService
  async save(conversation: ConversationEntity) {
    // 转换为旧格式
    const oldData = this.toOldFormat(conversation);
    // 调用现有服务
    return ConversationService.createConversation(oldData);
  }
}
```

**关键：** 新 Repository **包装**旧 Service，而不是替换它

#### 2.4 创建 Use Case

```typescript
// api/_clean/application/use-cases/create-conversation.use-case.ts
export class CreateConversationUseCase {
  // 使用新的 Repository interface
}
```

#### 2.5 在路由中添加功能开关

```typescript
// api/lambda/conversations.ts
import { ConversationService } from '../services/conversationService.js';
import { container } from '../_clean/di-container.js';
import { CreateConversationUseCase } from '../_clean/application/use-cases/create-conversation.use-case.js';

const USE_CLEAN_ARCH = process.env.USE_CLEAN_ARCH === 'true';

export async function post({ data }) {
  try {
    if (USE_CLEAN_ARCH) {
      // 🆕 使用新架构
      const useCase = container.get<CreateConversationUseCase>('CreateConversationUseCase');
      const result = await useCase.execute(data.userId, data.title);
      return successResponse({ conversation: result });
    } else {
      // ✅ 使用旧代码（默认）
      const db = await connectToDatabase();
      const result = await ConversationService.createConversation(db, data);
      return successResponse(result);
    }
  } catch (error) {
    return errorResponse(error.message);
  }
}
```

#### 2.6 测试和验证

```bash
# 测试旧代码（默认）
npm run dev
# 测试API...

# 测试新代码
USE_CLEAN_ARCH=true npm run dev
# 测试API...
```

#### 2.7 提交

```bash
git add api/_clean/
git commit -m "feat: add Clean Architecture for Conversation module (dual-track)"
```

---

### Phase 3: 逐步迁移其他模块（1周/模块）

重复 Phase 2 的步骤，每次一个模块：

1. ✅ **Conversation** (Pilot)
2. **Message**
3. **User**
4. **Upload**
5. **Chat/Agent**

每个模块：
- 创建新架构代码
- 通过功能开关切换
- 验证功能正常
- Git 提交
- **保持旧代码不删除**

---

### Phase 4: 切换到新架构（1-2天）

当所有模块都有新实现后：

#### 4.1 修改环境变量

```bash
# .env
USE_CLEAN_ARCH=true
```

#### 4.2 全面测试

- 测试所有 API 端点
- 测试边界情况
- 性能测试

#### 4.3 监控和观察

在生产环境运行几天，观察是否有问题

---

### Phase 5: 清理旧代码（可选，1-2天）

**如果新架构运行稳定1周以上**，才考虑删除旧代码：

1. 移除功能开关
2. 删除旧的 Service 文件
3. 清理不再使用的依赖

---

## 🛠️ 实施细节

### 目录结构（最终）

```
api/
├── lambda/                    # BFF 路由（Modern.js 扫描）
│   ├── conversations.ts       # 包含功能开关
│   ├── chat.ts
│   └── ...
│
├── _clean/                    # 新架构（被 Modern.js 忽略）
│   ├── domain/
│   │   └── entities/
│   │       ├── conversation.entity.ts
│   │       └── message.entity.ts
│   ├── application/
│   │   ├── interfaces/
│   │   │   └── repositories/
│   │   └── use-cases/
│   │       ├── conversation/
│   │       └── message/
│   ├── infrastructure/
│   │   └── repositories/
│   │       ├── conversation.repository.ts
│   │       └── message.repository.ts
│   └── di-container.ts
│
├── services/                  # 旧代码（逐步淘汰）
│   ├── conversationService.ts
│   └── messageService.ts
│
├── handlers/                  # 旧代码（逐步淘汰）
├── db/                        # 保留（数据库连接）
├── config/                    # 保留（配置）
├── types/                     # 保留（类型定义）
└── tsconfig.json
```

### 依赖注入配置

```typescript
// api/_clean/di-container.ts
import { Container } from 'inversify';
import 'reflect-metadata';

const container = new Container();

// 绑定 Repositories
container.bind<IConversationRepository>('ConversationRepository')
  .to(ConversationRepository)
  .inSingletonScope();

// 绑定 Use Cases
container.bind<CreateConversationUseCase>('CreateConversationUseCase')
  .to(CreateConversationUseCase);

export { container };
```

### 功能开关模式

```typescript
// api/lambda/_utils/arch-switch.ts
export const USE_CLEAN_ARCH = process.env.USE_CLEAN_ARCH === 'true';

export function withArchSwitch<T>(
  oldImplementation: () => Promise<T>,
  newImplementation: () => Promise<T>
): Promise<T> {
  return USE_CLEAN_ARCH ? newImplementation() : oldImplementation();
}
```

使用示例：
```typescript
import { withArchSwitch } from './_utils/arch-switch.js';

export async function post({ data }) {
  return withArchSwitch(
    // 旧实现
    async () => {
      const db = await connectToDatabase();
      return ConversationService.createConversation(db, data);
    },
    // 新实现
    async () => {
      const useCase = container.get<CreateConversationUseCase>('CreateConversationUseCase');
      return useCase.execute(data.userId, data.title);
    }
  );
}
```

---

## 📊 进度追踪

### Checklist

#### Phase 1: 基础设施 ⏳
- [ ] 创建 `api/_clean/` 目录结构
- [ ] 安装依赖（inversify, reflect-metadata, zod）
- [ ] 创建 DI 容器
- [ ] 创建功能开关工具
- [ ] Git 提交

#### Phase 2: Conversation 模块（Pilot） ⏳
- [ ] ConversationEntity
- [ ] IConversationRepository
- [ ] ConversationRepository（包装旧代码）
- [ ] CreateConversationUseCase
- [ ] GetConversationsUseCase
- [ ] 在路由中添加功能开关
- [ ] 测试新旧两种实现
- [ ] Git 提交

#### Phase 3: Message 模块 ⏳
- [ ] MessageEntity
- [ ] IMessageRepository
- [ ] MessageRepository
- [ ] CreateMessageUseCase
- [ ] GetMessagesUseCase
- [ ] 在路由中添加功能开关
- [ ] 测试
- [ ] Git 提交

#### Phase 4: 其他模块 ⏳
- [ ] User
- [ ] Upload
- [ ] Device
- [ ] Metrics

#### Phase 5: 切换和清理 ⏳
- [ ] 设置 USE_CLEAN_ARCH=true
- [ ] 全面测试
- [ ] 监控1周
- [ ] 移除旧代码

---

## ⏱️ 时间估算

| 阶段 | 预计时间 | 说明 |
|------|----------|------|
| Phase 1 | 1-2天 | 建立基础，一次性完成 |
| Phase 2 | 3-5天 | Pilot 模块，需要仔细验证 |
| Phase 3 | 4-8周 | 每个模块1周，可并行 |
| Phase 4 | 1-2天 | 切换和测试 |
| Phase 5 | 1-2天 | 清理（可选） |
| **总计** | **6-11周** | 取决于模块数量 |

**注意：** 这是业余时间重构的估算。如果全职，可以缩短到 2-3周。

---

## 🎓 经验教训

### 这次失败告诉我们

1. **Modern.js BFF 的限制**
   - 它会递归扫描和编译 `api/` 下的所有文件
   - 移动文件到项目外会导致模块解析问题
   - 使用 `_` 前缀目录可以避免被扫描

2. **ESM vs CommonJS 的坑**
   - TypeScript 中 `.ts` 文件导入要用 `.js` 扩展名
   - Modern.js 编译时会尝试解析所有导入
   - 混合使用会导致各种问题

3. **渐进式 > 激进式**
   - 一次性改太多会失控
   - 双轨并行可以随时回退
   - 功能开关是渐进式重构的关键

### 应用到这次重构

1. **不移动现有文件** - 所有新代码放在 `api/_clean/`
2. **包装而非替换** - 新 Repository 内部调用旧 Service
3. **功能开关** - 随时可以切回旧实现
4. **小步提交** - 每个稳定状态都提交

---

## 🚀 下一步行动

### 立即开始（今天）

1. **创建基础目录结构**
   ```bash
   mkdir -p api/_clean/{domain/entities,application/{interfaces/repositories,use-cases},infrastructure/repositories}
   ```

2. **安装依赖**
   ```bash
   npm install inversify reflect-metadata zod
   ```

3. **创建 DI 容器骨架**
   - `api/_clean/di-container.ts`

### 明天开始 Pilot

4. **实现 Conversation 模块**
   - Entity
   - Repository Interface
   - Repository Implementation (包装旧代码)
   - Use Cases

5. **添加功能开关**
   - 在 `conversations.ts` 中

6. **测试两种实现**

---

## 📞 需要帮助？

如果你准备好开始：

1. **我可以帮你创建基础结构** - Phase 1
2. **我可以帮你实现 Pilot 模块** - Phase 2
3. **你可以按照这个计划自己做** - 完全可行

**准备好了吗？要不要现在就开始 Phase 1？** 🚀

---

**创建时间：** 2025-01-01  
**状态：** 准备开始  
**风险等级：** 🟢 低（渐进式，可随时回退）

