# Phase 2: Handlers & Services 重构计划

## 📋 概述

在完成 Phase 1（CRUD 模块迁移）后，Phase 2 将重构更复杂的业务逻辑层，包括 handlers、services 和 utils。

---

## 🎯 重构目标

1. ✅ 将 handlers 中的业务逻辑提取为 Use Cases
2. ✅ 将 services 中的基础设施代码移到 Infrastructure 层
3. ✅ 整理 utils 为共享工具库
4. ✅ 保持代码的可测试性和可维护性

---

## 📦 待重构模块分析

### 1. Handlers（流处理和工作流）

#### 1.1 SSE Handler (`sseHandler.ts` - 783行)

**当前职责**：
- SSE 连接管理
- 流数据处理
- 错误处理
- 多代理/单代理调度

**重构方向**：
```
sseHandler.ts (783行)
  ↓ 拆分为
├── Application Layer
│   ├── use-cases/streaming/
│   │   ├── start-sse-stream.use-case.ts
│   │   ├── handle-stream-chunk.use-case.ts
│   │   ├── close-sse-stream.use-case.ts
│   │   └── route-to-agent.use-case.ts
│   └── interfaces/
│       └── sse-stream.interface.ts
└── Infrastructure Layer
    └── streaming/
        ├── sse-connection-manager.ts
        └── stream-writer.ts
```

#### 1.2 Multi-Agent Handler (`multiAgentHandler.ts` - 293行)

**当前职责**：
- 多代理协调
- 工作流编排
- Agent 之间通信

**重构方向**：
```
multiAgentHandler.ts
  ↓ 重构为
├── Domain Layer
│   └── entities/
│       ├── agent.entity.ts
│       ├── agent-session.entity.ts
│       └── workflow.entity.ts
├── Application Layer
│   └── use-cases/agent/
│       ├── create-agent-session.use-case.ts
│       ├── execute-workflow.use-case.ts
│       ├── coordinate-agents.use-case.ts
│       └── process-agent-response.use-case.ts
└── Infrastructure Layer
    └── agent/
        ├── agent-orchestrator.ts
        └── workflow-engine.ts
```

#### 1.3 Single Agent Handler (`singleAgentHandler.ts` - 629行)

**当前职责**：
- 单代理执行
- 工具调用
- 结果处理

**重构方向**：
```
singleAgentHandler.ts
  ↓ 重构为
├── Application Layer
│   └── use-cases/agent/
│       ├── execute-single-agent.use-case.ts
│       ├── call-tools.use-case.ts
│       └── process-agent-result.use-case.ts
└── Infrastructure Layer
    └── agent/
        └── tool-executor.ts
```

#### 1.4 Workflow Processor (`workflowProcessor.ts` - 285行)

**当前职责**：
- 工作流定义
- 工作流执行
- 状态管理

**重构方向**：
```
workflowProcessor.ts
  ↓ 重构为
├── Domain Layer
│   └── entities/
│       ├── workflow-definition.entity.ts
│       ├── workflow-step.entity.ts
│       └── workflow-execution.entity.ts
├── Application Layer
│   └── use-cases/workflow/
│       ├── start-workflow.use-case.ts
│       ├── execute-step.use-case.ts
│       ├── handle-step-result.use-case.ts
│       └── complete-workflow.use-case.ts
└── Infrastructure Layer
    └── workflow/
        └── workflow-state-manager.ts
```

---

### 2. Services（业务服务和基础设施）

#### 2.1 需要重构的业务服务

##### conversationMemoryService.ts (364行)

**当前职责**：
- 对话记忆管理
- 上下文窗口管理
- 记忆检索

**重构方向**：
```
├── Domain Layer
│   └── entities/
│       ├── conversation-memory.entity.ts
│       └── memory-window.entity.ts
├── Application Layer
│   ├── interfaces/repositories/
│   │   └── memory.repository.interface.ts
│   └── use-cases/memory/
│       ├── get-conversation-memory.use-case.ts
│       ├── update-memory-window.use-case.ts
│       └── clear-memory.use-case.ts
└── Infrastructure Layer
    └── repositories/
        └── memory.repository.ts (Redis-based)
```

##### multiAgentSessionService.ts (279行)

**当前职责**：
- 多代理会话管理
- 会话状态跟踪

**重构方向**：合并到 Agent 模块（见 1.2）

##### chunkingPlanReviewService.ts (349行)

**当前职责**：
- 文本分块计划
- 计划审查

**重构方向**：
```
├── Domain Layer
│   └── entities/
│       └── chunking-plan.entity.ts
├── Application Layer
│   └── use-cases/chunking/
│       ├── create-chunking-plan.use-case.ts
│       └── review-chunking-plan.use-case.ts
└── Infrastructure Layer
    └── chunking/
        └── text-chunker.ts (from utils)
```

##### planService.ts (155行)

**当前职责**：
- 计划生成
- 计划存储

**重构方向**：
```
├── Domain Layer
│   └── entities/
│       └── plan.entity.ts
├── Application Layer
│   └── use-cases/plan/
│       ├── create-plan.use-case.ts
│       └── get-plan.use-case.ts
└── Infrastructure Layer
    └── repositories/
        └── plan.repository.ts
```

#### 2.2 需要移到 Infrastructure 层的服务

##### redisClient.ts (438行)

**处理方式**：
```
移动到 api/_clean/infrastructure/cache/redis-client.ts
- 作为缓存基础设施
- 提供 ICacheRepository 接口实现
```

##### queueManager.ts (266行)

**处理方式**：
```
移动到 api/_clean/infrastructure/queue/queue-manager.ts
- 作为队列基础设施
- 提供 IQueueService 接口实现
```

##### sseLimiter.ts (161行)

**处理方式**：
```
移动到 api/_clean/infrastructure/streaming/sse-limiter.ts
- 作为流限流基础设施
```

##### modelService.ts (67行)

**处理方式**：
```
移动到 api/_clean/infrastructure/llm/model-service.ts
- 提供 ILLMService 接口
```

##### volcengineService.ts (194行)

**处理方式**：
```
移动到 api/_clean/infrastructure/llm/volcengine-service.ts
- 实现 ILLMService 接口
```

---

### 3. Utils（工具函数）

#### 3.1 需要移到 Infrastructure 层

##### toolExecutor.ts (124行)

```
移动到 api/_clean/infrastructure/tools/tool-executor.ts
- 提供 IToolExecutor 接口
```

##### llmCaller.ts (59行)

```
移动到 api/_clean/infrastructure/llm/llm-caller.ts
- 提供 LLM 调用封装
```

#### 3.2 保持为共享工具

##### jsonExtractor.ts (429行)

```
移动到 api/_clean/shared/utils/json-extractor.ts
- 纯工具函数
- 各层都可以使用
```

##### textChunker.ts (248行)

```
移动到 api/_clean/shared/utils/text-chunker.ts
- 或者移到 Infrastructure/chunking/
```

##### sseStreamWriter.ts (94行)

```
移动到 api/_clean/infrastructure/streaming/sse-stream-writer.ts
```

##### contentExtractor.ts (42行)

```
移动到 api/_clean/shared/utils/content-extractor.ts
```

---

## 🗺️ 重构路线图

### 阶段 2.1: 清理和移动（1周）

**目标**: 移动明确的基础设施代码

```
✅ 任务清单
├── [ ] 创建 api/_clean/infrastructure/ 子目录
│   ├── cache/
│   ├── queue/
│   ├── streaming/
│   ├── llm/
│   └── tools/
├── [ ] 移动 redisClient.ts
├── [ ] 移动 queueManager.ts
├── [ ] 移动 sseLimiter.ts
├── [ ] 移动 modelService.ts
├── [ ] 移动 volcengineService.ts
├── [ ] 移动 toolExecutor.ts
├── [ ] 移动 llmCaller.ts
└── [ ] 更新所有引用路径
```

### 阶段 2.2: 重构 Memory 模块（1周）

```
✅ 任务清单
├── [ ] 创建 ConversationMemoryEntity
├── [ ] 创建 IMemoryRepository 接口
├── [ ] 实现 RedisMemoryRepository
├── [ ] 创建 Memory Use Cases
├── [ ] 更新 API 集成
└── [ ] 测试验证
```

### 阶段 2.3: 重构 Workflow 模块（2周）

```
✅ 任务清单
├── [ ] 创建 Workflow 相关实体
├── [ ] 创建 IWorkflowRepository 接口
├── [ ] 实现 WorkflowRepository
├── [ ] 创建 Workflow Use Cases
├── [ ] 重构 workflowProcessor.ts
├── [ ] 更新 API 集成
└── [ ] 测试验证
```

### 阶段 2.4: 重构 Agent 模块（3周）

```
✅ 任务清单
├── [ ] 创建 Agent 相关实体
├── [ ] 创建 AgentSession 相关实体
├── [ ] 创建 IAgentRepository 接口
├── [ ] 实现 AgentRepository
├── [ ] 创建 Agent Use Cases
├── [ ] 重构 multiAgentHandler.ts
├── [ ] 重构 singleAgentHandler.ts
├── [ ] 更新 API 集成
└── [ ] 测试验证
```

### 阶段 2.5: 重构 Streaming 模块（2周）

```
✅ 任务清单
├── [ ] 创建 Stream 相关实体
├── [ ] 创建 IStreamRepository 接口
├── [ ] 实现 StreamRepository
├── [ ] 创建 Streaming Use Cases
├── [ ] 重构 sseHandler.ts
├── [ ] 重构 sseLocalHandler.ts
├── [ ] 重构 sseVolcanoHandler.ts
├── [ ] 更新 API 集成
└── [ ] 测试验证
```

---

## 📐 新的目录结构（Phase 2 完成后）

```
api/_clean/
├── domain/
│   └── entities/
│       ├── conversation.entity.ts ✅
│       ├── message.entity.ts ✅
│       ├── user.entity.ts ✅
│       ├── upload-session.entity.ts ✅
│       ├── device.entity.ts ✅
│       ├── metrics.entity.ts ✅
│       ├── conversation-memory.entity.ts ⏳
│       ├── agent.entity.ts ⏳
│       ├── agent-session.entity.ts ⏳
│       ├── workflow.entity.ts ⏳
│       ├── workflow-step.entity.ts ⏳
│       └── chunking-plan.entity.ts ⏳
│
├── application/
│   ├── interfaces/
│   │   └── repositories/
│   │       ├── conversation.repository.interface.ts ✅
│   │       ├── message.repository.interface.ts ✅
│   │       ├── user.repository.interface.ts ✅
│   │       ├── upload.repository.interface.ts ✅
│   │       ├── device.repository.interface.ts ✅
│   │       ├── metrics.repository.interface.ts ✅
│   │       ├── memory.repository.interface.ts ⏳
│   │       ├── agent.repository.interface.ts ⏳
│   │       └── workflow.repository.interface.ts ⏳
│   └── use-cases/
│       ├── conversation/ ✅
│       ├── message/ ✅
│       ├── user/ ✅
│       ├── upload/ ✅
│       ├── device/ ✅
│       ├── metrics/ ✅
│       ├── memory/ ⏳
│       ├── agent/ ⏳
│       ├── workflow/ ⏳
│       ├── streaming/ ⏳
│       └── chunking/ ⏳
│
├── infrastructure/
│   ├── repositories/
│   │   ├── conversation.repository.ts ✅
│   │   ├── message.repository.ts ✅
│   │   ├── user.repository.ts ✅
│   │   ├── upload.repository.ts ✅
│   │   ├── device.repository.ts ✅
│   │   ├── metrics.repository.ts ✅
│   │   ├── memory.repository.ts ⏳
│   │   ├── agent.repository.ts ⏳
│   │   └── workflow.repository.ts ⏳
│   ├── cache/
│   │   └── redis-client.ts ⏳
│   ├── queue/
│   │   └── queue-manager.ts ⏳
│   ├── streaming/
│   │   ├── sse-limiter.ts ⏳
│   │   ├── sse-stream-writer.ts ⏳
│   │   └── sse-connection-manager.ts ⏳
│   ├── llm/
│   │   ├── model-service.ts ⏳
│   │   ├── volcengine-service.ts ⏳
│   │   └── llm-caller.ts ⏳
│   ├── tools/
│   │   └── tool-executor.ts ⏳
│   └── chunking/
│       └── text-chunker.ts ⏳
│
├── shared/
│   └── utils/
│       ├── json-extractor.ts ⏳
│       └── content-extractor.ts ⏳
│
└── di-container.ts
```

---

## 🎯 重构原则

### 1. 单一职责原则（SRP）

每个模块只负责一件事：
- Entity: 业务规则和数据
- Use Case: 单一业务流程
- Repository: 单一数据源访问

### 2. 依赖倒置原则（DIP）

```
高层模块 (Use Cases) 
    ↓ 依赖
接口 (Interfaces)
    ↑ 实现
低层模块 (Repositories, Services)
```

### 3. 接口隔离原则（ISP）

定义细粒度的接口，而不是一个大而全的接口

### 4. 开闭原则（OCP）

对扩展开放，对修改关闭

---

## 📝 迁移检查清单

每个模块迁移时需要确认：

- [ ] 实体定义清晰，包含业务逻辑
- [ ] 仓储接口定义完整
- [ ] 仓储实现正确
- [ ] 用例单一职责
- [ ] DI 容器正确注册
- [ ] API 路由正确集成
- [ ] 特性开关可用
- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] 文档已更新

---

## ⚠️ 风险与挑战

### 风险 1: 流处理的复杂性

**问题**: SSE 流处理涉及异步、错误处理、连接管理等

**缓解措施**:
- 保持流处理的基础设施独立
- Use Case 只处理业务逻辑
- 充分测试各种异常情况

### 风险 2: 多代理系统的复杂性

**问题**: 多代理协调涉及状态机、编排、通信等复杂逻辑

**缓解措施**:
- 引入状态机模式
- 使用事件驱动架构
- 考虑使用现有的工作流引擎

### 风险 3: 性能影响

**问题**: 增加抽象层可能影响性能

**缓解措施**:
- 性能监控和对比测试
- 必要时使用缓存
- 优化热路径

---

## 📊 预期成果

Phase 2 完成后：

1. ✅ **100%** 的代码遵循 Clean Architecture
2. ✅ **80%+** 的测试覆盖率
3. ✅ 清晰的层次边界
4. ✅ 高度可测试和可维护
5. ✅ 易于扩展新功能

---

## 🤝 团队协作

### 建议分工

1. **开发者 A**: Memory + Chunking 模块
2. **开发者 B**: Workflow 模块
3. **开发者 C**: Agent 模块
4. **开发者 D**: Streaming 模块
5. **全体**: 基础设施移动（阶段 2.1）

### Code Review 要点

- 检查是否符合 SOLID 原则
- 检查依赖方向是否正确
- 检查测试覆盖率
- 检查文档完整性

---

## 📅 时间估算

| 阶段 | 工作量 | 时间 | 完成日期（预估） |
|------|--------|------|------------------|
| 2.1 基础设施移动 | 3人天 | 1周 | Week 1 |
| 2.2 Memory 模块 | 5人天 | 1周 | Week 2 |
| 2.3 Workflow 模块 | 10人天 | 2周 | Week 4 |
| 2.4 Agent 模块 | 15人天 | 3周 | Week 7 |
| 2.5 Streaming 模块 | 10人天 | 2周 | Week 9 |
| **总计** | **43人天** | **9周** | |

---

**最后更新**: 2025年12月31日  
**文档状态**: 规划中 ⏳

