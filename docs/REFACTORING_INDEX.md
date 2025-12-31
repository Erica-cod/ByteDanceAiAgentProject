# 后端重构文档索引

> 基于 Clean Architecture + BFF 的后端重构完整指南

---

## 📖 文档导航

### 🎯 [1. 重构方案总览](./BACKEND_REFACTORING_PLAN.md)

**适合人群：** 项目负责人、架构师、团队 Leader

**内容：**
- 重构目标和动机
- 架构设计详解（Clean Architecture 分层）
- 完整的目录结构规划
- 分层职责说明
- 实施步骤和时间规划
- 技术栈选型

**阅读时间：** 20-30 分钟

---

### 💻 [2. 代码示例详解](./REFACTORING_EXAMPLES.md)

**适合人群：** 开发人员

**内容：**
- 领域层示例（Entity、Value Object）
- 应用层示例（Use Case、Application Service、Repository 接口）
- 基础设施层示例（Repository 实现、外部服务）
- 表示层示例（DTO、Validator、API 路由）
- 依赖注入配置
- 单元测试和集成测试示例

**阅读时间：** 30-40 分钟

---

### 🚀 [3. 快速开始指南](./REFACTORING_QUICK_START.md)

**适合人群：** 希望立即上手的开发人员

**内容：**
- 环境准备（10 分钟）
- 第一个重构示例：Conversation 模块（30 分钟）
- 测试新架构（10 分钟）
- 验证重构效果（10 分钟）
- 常见问题解答

**阅读时间：** 15 分钟（实操：1 小时）

**🎯 推荐路径：** 如果你想马上开始重构，从这里开始！

---

### 🗺️ [4. 迁移对照表](./MIGRATION_MAPPING.md)

**适合人群：** 执行迁移的开发人员

**内容：**
- 旧代码到新架构的详细映射
- 每个目录的迁移方式
- 迁移顺序建议
- 迁移检查清单
- 迁移进度追踪模板
- 问题排查指南

**阅读时间：** 20 分钟

---

## 📊 架构对比

### 旧架构（平面结构）

```
api/
├── agents/          # AI Agents
├── config/          # 配置文件
├── db/              # 数据库（模型 + 连接）
├── handlers/        # 处理器（SSE 流）
├── lambda/          # BFF API 路由
├── services/        # 服务（混合了多种职责）
├── tools/           # 工具
├── types/           # 类型定义
├── utils/           # 工具函数
└── workflows/       # 工作流
```

**问题：**
- ❌ 职责不清晰（services 混合了业务逻辑、数据访问、外部服务）
- ❌ 依赖混乱（相互依赖、循环引用）
- ❌ 难以测试（需要真实数据库）
- ❌ 难以扩展（修改影响范围大）

---

### 新架构（Clean Architecture 分层）

```
api/
├── presentation/        # 表示层
│   ├── lambda/         # BFF API 路由（Modern.js）
│   ├── dto/            # 数据传输对象
│   ├── validators/     # 请求验证
│   └── middleware/     # 中间件
│
├── application/        # 应用层
│   ├── use-cases/      # 业务用例
│   ├── services/       # 应用服务（跨用例协调）
│   └── interfaces/     # 接口定义
│       ├── repositories/
│       └── services/
│
├── domain/            # 领域层
│   ├── entities/      # 领域实体
│   ├── value-objects/ # 值对象
│   ├── services/      # 领域服务
│   ├── events/        # 领域事件
│   └── exceptions/    # 领域异常
│
├── infrastructure/    # 基础设施层
│   ├── database/      # 数据库实现
│   │   ├── mongodb/   # MongoDB（Repositories）
│   │   └── redis/     # Redis
│   ├── external-services/  # 外部服务
│   │   ├── llm/       # LLM 服务
│   │   └── search/    # 搜索服务
│   ├── ai-agents/     # AI Agents
│   ├── tools/         # 工具实现
│   └── streaming/     # 流式处理
│
└── shared/            # 共享代码
    ├── config/        # 配置
    ├── constants/     # 常量
    ├── types/         # 共享类型
    ├── utils/         # 工具函数
    └── container/     # 依赖注入容器
```

**优势：**
- ✅ 职责清晰（每层只负责自己的事）
- ✅ 单向依赖（内层不依赖外层）
- ✅ 易于测试（可以 Mock 所有外部依赖）
- ✅ 易于扩展（新增功能影响范围小）
- ✅ 易于维护（代码组织清晰）

---

## 🎯 核心概念

### 1. Clean Architecture 分层

```
Presentation → Application → Domain ← Infrastructure
     ↓              ↓           ↓           ↑
  API 路由      Use Cases    实体/规则   具体实现
```

**依赖规则：**
- 外层依赖内层
- 内层不知道外层
- 通过接口实现依赖倒置

---

### 2. 领域驱动设计（DDD）核心概念

#### Entity（实体）
包含业务逻辑的核心对象，有唯一标识符。

```typescript
class ConversationEntity {
  private _title: string;
  
  updateTitle(newTitle: string): void {
    // 业务规则验证
    if (!newTitle.trim()) {
      throw new Error('Title cannot be empty');
    }
    this._title = newTitle;
  }
}
```

#### Repository（仓储）
数据访问的抽象接口。

```typescript
interface IConversationRepository {
  save(conversation: ConversationEntity): Promise<void>;
  findById(id: string): Promise<ConversationEntity | null>;
}
```

#### Use Case（用例）
编排业务流程，协调多个服务。

```typescript
class CreateConversationUseCase {
  async execute(input) {
    // 1. 创建实体（业务逻辑）
    const conversation = ConversationEntity.create(input.userId);
    
    // 2. 持久化（数据访问）
    await this.repository.save(conversation);
    
    // 3. 返回结果
    return { conversationId: conversation.id };
  }
}
```

---

### 3. BFF（Backend for Frontend）

Modern.js BFF 特性：
- ✅ **函数式路由**：`api/lambda/*.ts` 自动映射为 API
- ✅ **类型安全**：前后端共享类型定义
- ✅ **开发体验**：热更新、自动类型推导

我们的集成方式：
- Lambda 目录保持不变（符合 Modern.js 约定）
- 路由内部调用新架构的 Use Cases
- 实现了 BFF 和 Clean Architecture 的完美结合

---

## 🛠️ 技术栈

### 核心依赖

| 技术 | 用途 | 版本 |
|------|------|------|
| **inversify** | 依赖注入容器 | ^6.0.0 |
| **reflect-metadata** | 装饰器元数据 | ^0.2.0 |
| **zod** | 请求验证 | ^3.22.0 |
| **vitest** | 单元测试 | ^1.0.0 |

### 已有依赖（复用）

- **MongoDB** - 数据库
- **Redis** - 缓存
- **LangChain** - AI 编排
- **Modern.js** - BFF 框架

---

## 📅 实施计划

### 总时间：2-3 周

| 阶段 | 时间 | 任务 |
|------|------|------|
| **Phase 1** | 1-2 天 | 基础设施搭建（目录、依赖注入、配置） |
| **Phase 2** | 2-3 天 | 数据层重构（Entity、Repository） |
| **Phase 3** | 3-5 天 | 业务逻辑层重构（Use Cases、Services） |
| **Phase 4** | 3-5 天 | AI 功能迁移（Agents、Tools、Workflows） |
| **Phase 5** | 2-3 天 | API 层重构（Lambda 路由） |
| **Phase 6** | 1-2 天 | 清理和优化 |

---

## 🎓 学习路径

### 新手路径

1. **第一天：** 阅读 [重构方案总览](./BACKEND_REFACTORING_PLAN.md)，理解整体架构
2. **第二天：** 跟着 [快速开始指南](./REFACTORING_QUICK_START.md) 实操 Conversation 模块
3. **第三天：** 阅读 [代码示例](./REFACTORING_EXAMPLES.md)，理解各层实现细节
4. **第四天开始：** 使用 [迁移对照表](./MIGRATION_MAPPING.md) 迁移其他模块

### 有经验开发者路径

1. **30 分钟：** 快速浏览 [重构方案总览](./BACKEND_REFACTORING_PLAN.md)
2. **1 小时：** 按照 [快速开始指南](./REFACTORING_QUICK_START.md) 完成第一个模块
3. **之后：** 直接使用 [迁移对照表](./MIGRATION_MAPPING.md) 快速迁移

---

## ✅ 重构检查清单

### 准备阶段
- [ ] 团队达成共识
- [ ] 阅读完整文档
- [ ] 安装依赖
- [ ] 创建新目录结构
- [ ] 配置路径别名

### 每个模块
- [ ] 定义 Entity
- [ ] 定义 Repository 接口
- [ ] 实现 MongoDB Repository
- [ ] 创建 Use Cases
- [ ] 重构 Lambda 路由
- [ ] 编写测试
- [ ] 更新文档

### 完成阶段
- [ ] 所有模块迁移完成
- [ ] 测试通过
- [ ] 性能验证
- [ ] 删除旧代码
- [ ] 更新文档

---

## 🆘 获取帮助

### 常见问题

参考每个文档的 FAQ 部分：
- [快速开始 - 常见问题](./REFACTORING_QUICK_START.md#常见问题)
- [迁移对照表 - 问题排查](./MIGRATION_MAPPING.md#迁移问题排查)

### 参考资料

- [eShopOnWeb GitHub](https://github.com/dotnet-architecture/eShopOnWeb)
- [Clean Architecture 博客](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Modern.js BFF 文档](https://modernjs.dev/guides/features/server-side/bff/function.html)
- [DDD 参考指南](https://domainlanguage.com/ddd/reference/)

---

## 🎯 推荐阅读顺序

### 方案1: 全面了解（适合项目负责人）

```
1. 重构方案总览（30 分钟）
   ↓
2. 代码示例详解（40 分钟）
   ↓
3. 快速开始指南（浏览）
   ↓
4. 迁移对照表（浏览）
```

### 方案2: 快速上手（适合执行开发者）

```
1. 快速开始指南（1 小时实操）
   ↓
2. 迁移对照表（开始迁移）
   ↓
3. 代码示例详解（遇到问题时参考）
```

---

## 📈 预期收益

### 可维护性
- **代码结构清晰**：新人上手时间从 3 天降到 1 天
- **修改影响可控**：单个功能修改不影响其他模块
- **易于 Code Review**：每层职责单一，易于审查

### 可扩展性
- **新功能接入快**：平均从 2 天降到半天
- **支持多数据源**：可轻松切换 MySQL、PostgreSQL
- **支持多 LLM**：可快速接入新的 AI 模型

### 可测试性
- **测试覆盖率**：从 20% 提升到 80%+
- **单元测试容易**：无需真实数据库
- **集成测试简单**：可以 Mock 外部依赖

### 开发效率
- **减少 Bug**：编译期发现更多错误
- **提升信心**：重构不怕破坏现有功能
- **团队协作**：多人并行开发不冲突

---

## 🚀 开始重构

选择你的入口：

### 👥 团队负责人
→ 阅读 [重构方案总览](./BACKEND_REFACTORING_PLAN.md)

### 💻 开发人员（想快速上手）
→ 开始 [快速开始指南](./REFACTORING_QUICK_START.md)

### 📋 开发人员（开始迁移）
→ 参考 [迁移对照表](./MIGRATION_MAPPING.md)

### 📖 开发人员（深入学习）
→ 阅读 [代码示例详解](./REFACTORING_EXAMPLES.md)

---

**祝重构顺利！** 🎉

如果遇到任何问题，请查阅相关文档的 FAQ 部分，或者在团队内讨论。

---

**最后更新：** 2025-01-01  
**维护人：** AI Agent Team

