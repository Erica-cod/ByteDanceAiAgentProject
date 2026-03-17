# Phase 2 准备工作

## 📋 概述

**日期**: 2025年12月31日  
**状态**: 🚀 准备开始  
**前置条件**: ✅ Phase 1 已完成

---

## ✅ Phase 1 完成检查清单

### 代码完成度

- [x] 6 个核心模块完成迁移（Conversation, Message, User, Upload, Device, Metrics）
- [x] 所有 API 端点使用新架构
- [x] 特性开关强制启用新架构
- [x] 旧服务文件标记为废弃
- [x] 服务器稳定运行
- [x] 无已知的 critical bugs

### 文档完成度

- [x] Phase 1 迁移总结文档
- [x] Phase 1 清理总结文档
- [x] Phase 2 重构计划文档
- [x] 废弃文件说明文档

### 技术债务

- [ ] 单元测试覆盖率不足（目标 80%，当前 ~0%）
- [ ] 缺少集成测试
- [ ] 性能基准测试未完成
- [ ] API 文档未更新

**决策**: 在 Phase 2 进行时同步添加测试

---

## 🎯 Phase 2 目标

### 核心目标

1. **重构 handlers/** - 流处理和工作流（2,554 行）
2. **重构 services/** - 业务服务（~2,500 行）
3. **整理 utils/** - 工具函数（~1,000 行）
4. **完善测试** - 达到 80% 覆盖率
5. **性能优化** - 识别并优化瓶颈

### 非功能性目标

- ✅ 保持系统稳定性
- ✅ 零停机时间迁移
- ✅ 向后兼容
- ✅ 代码质量提升

---

## 📦 Phase 2 模块清单

### 优先级 1: 基础设施移动（阶段 2.1，1周）

**目标**: 将明确的基础设施代码移到 `Infrastructure/` 层

```
待移动的文件：
├── redisClient.ts (438行)
│   → api/_clean/infrastructure/cache/redis-client.ts
│
├── queueManager.ts (266行)
│   → api/_clean/infrastructure/queue/queue-manager.ts
│
├── sseLimiter.ts (161行)
│   → api/_clean/infrastructure/streaming/sse-limiter.ts
│
├── modelService.ts (67行)
│   → api/_clean/infrastructure/llm/model-service.ts
│
├── volcengineService.ts (194行)
│   → api/_clean/infrastructure/llm/volcengine-service.ts
│
├── toolExecutor.ts (124行)
│   → api/_clean/infrastructure/tools/tool-executor.ts
│
└── llmCaller.ts (59行)
    → api/_clean/infrastructure/llm/llm-caller.ts
```

**工作量**: 3 人天  
**复杂度**: ⭐ 低  
**风险**: 低（主要是移动和更新引用）

---

### 优先级 2: Memory 模块（阶段 2.2，1周）

**源文件**: `conversationMemoryService.ts` (364行)

**重构为**:
```
api/_clean/
├── domain/entities/
│   ├── conversation-memory.entity.ts
│   └── memory-window.entity.ts
├── application/
│   ├── interfaces/repositories/
│   │   └── memory.repository.interface.ts
│   └── use-cases/memory/
│       ├── get-conversation-memory.use-case.ts
│       ├── update-memory-window.use-case.ts
│       └── clear-memory.use-case.ts
└── infrastructure/repositories/
    └── memory.repository.ts
```

**工作量**: 5 人天  
**复杂度**: ⭐⭐ 中  
**风险**: 中（涉及 Redis 缓存）

---

### 优先级 3: Workflow 模块（阶段 2.3，2周）

**源文件**: 
- `workflowProcessor.ts` (285行)
- `planService.ts` (155行)

**重构为**:
```
api/_clean/
├── domain/entities/
│   ├── workflow-definition.entity.ts
│   ├── workflow-step.entity.ts
│   ├── workflow-execution.entity.ts
│   └── plan.entity.ts
├── application/
│   ├── interfaces/repositories/
│   │   ├── workflow.repository.interface.ts
│   │   └── plan.repository.interface.ts
│   └── use-cases/
│       ├── workflow/
│       │   ├── start-workflow.use-case.ts
│       │   ├── execute-step.use-case.ts
│       │   ├── handle-step-result.use-case.ts
│       │   └── complete-workflow.use-case.ts
│       └── plan/
│           ├── create-plan.use-case.ts
│           └── get-plan.use-case.ts
└── infrastructure/
    ├── repositories/
    │   ├── workflow.repository.ts
    │   └── plan.repository.ts
    └── workflow/
        └── workflow-state-manager.ts
```

**工作量**: 10 人天  
**复杂度**: ⭐⭐⭐ 高  
**风险**: 高（涉及状态机和编排）

---

### 优先级 4: Agent 模块（阶段 2.4，3周）

**源文件**: 
- `multiAgentHandler.ts` (293行)
- `singleAgentHandler.ts` (629行)
- `multiAgentSessionService.ts` (279行)

**重构为**:
```
api/_clean/
├── domain/entities/
│   ├── agent.entity.ts
│   ├── agent-session.entity.ts
│   └── agent-message.entity.ts
├── application/
│   ├── interfaces/repositories/
│   │   └── agent.repository.interface.ts
│   └── use-cases/agent/
│       ├── create-agent-session.use-case.ts
│       ├── execute-single-agent.use-case.ts
│       ├── execute-workflow.use-case.ts
│       ├── coordinate-agents.use-case.ts
│       ├── call-tools.use-case.ts
│       ├── process-agent-response.use-case.ts
│       └── process-agent-result.use-case.ts
└── infrastructure/
    ├── repositories/
    │   └── agent.repository.ts
    └── agent/
        ├── agent-orchestrator.ts
        └── workflow-engine.ts
```

**工作量**: 15 人天  
**复杂度**: ⭐⭐⭐⭐ 很高  
**风险**: 很高（涉及多代理协调、工作流编排）

---

### 优先级 5: Streaming 模块（阶段 2.5，2周）

**源文件**: 
- `sseHandler.ts` (783行)
- `sseLocalHandler.ts` (310行)
- `sseVolcanoHandler.ts` (243行)
- `chunkingPlanReviewService.ts` (349行)

**重构为**:
```
api/_clean/
├── domain/entities/
│   ├── stream.entity.ts
│   ├── stream-connection.entity.ts
│   └── chunking-plan.entity.ts
├── application/
│   ├── interfaces/repositories/
│   │   └── stream.repository.interface.ts
│   └── use-cases/
│       ├── streaming/
│       │   ├── start-sse-stream.use-case.ts
│       │   ├── handle-stream-chunk.use-case.ts
│       │   ├── close-sse-stream.use-case.ts
│       │   └── route-to-agent.use-case.ts
│       └── chunking/
│           ├── create-chunking-plan.use-case.ts
│           └── review-chunking-plan.use-case.ts
└── infrastructure/
    ├── repositories/
    │   └── stream.repository.ts
    ├── streaming/
    │   ├── sse-connection-manager.ts
    │   └── stream-writer.ts
    └── chunking/
        └── text-chunker.ts
```

**工作量**: 10 人天  
**复杂度**: ⭐⭐⭐⭐ 很高  
**风险**: 很高（涉及异步流、错误处理、连接管理）

---

### 优先级 6: 工具函数整理（与其他阶段并行）

**源文件**: 
- `jsonExtractor.ts` (429行)
- `textChunker.ts` (248行)
- `sseStreamWriter.ts` (94行)
- `contentExtractor.ts` (42行)

**重构为**:
```
api/_clean/shared/utils/
├── json-extractor.ts
└── content-extractor.ts
```

**工作量**: 2 人天  
**复杂度**: ⭐ 低  
**风险**: 低（纯工具函数）

---

## 📅 Phase 2 时间表

### 总览

| 阶段 | 内容 | 工作量 | 时间 | 开始日期 | 结束日期 |
|------|------|--------|------|----------|----------|
| 2.1 | 基础设施移动 | 3人天 | 1周 | Week 1 | Week 1 |
| 2.2 | Memory 模块 | 5人天 | 1周 | Week 2 | Week 2 |
| 2.3 | Workflow 模块 | 10人天 | 2周 | Week 3 | Week 4 |
| 2.4 | Agent 模块 | 15人天 | 3周 | Week 5 | Week 7 |
| 2.5 | Streaming 模块 | 10人天 | 2周 | Week 8 | Week 9 |
| 2.6 | 工具函数 | 2人天 | 并行 | Week 1 | Week 9 |
| **总计** | | **45人天** | **9周** | | |

### 详细计划（Week 1）

#### Day 1-2: 基础设施移动准备

**任务**:
- [ ] 创建 `api/_clean/infrastructure/` 子目录结构
  - cache/
  - queue/
  - streaming/
  - llm/
  - tools/
- [ ] 定义基础设施接口
  - ICacheService
  - IQueueService
  - ILLMService
  - IToolExecutor

**交付物**:
- 目录结构
- 接口定义文件

#### Day 3-4: 移动文件

**任务**:
- [ ] 移动 `redisClient.ts` → `infrastructure/cache/`
- [ ] 移动 `queueManager.ts` → `infrastructure/queue/`
- [ ] 移动 `sseLimiter.ts` → `infrastructure/streaming/`
- [ ] 移动 `modelService.ts` → `infrastructure/llm/`
- [ ] 移动 `volcengineService.ts` → `infrastructure/llm/`
- [ ] 移动 `toolExecutor.ts` → `infrastructure/tools/`
- [ ] 移动 `llmCaller.ts` → `infrastructure/llm/`

**交付物**:
- 移动后的文件
- 更新的导入路径

#### Day 5: 测试和验证

**任务**:
- [ ] 更新所有引用路径
- [ ] 服务器启动测试
- [ ] 功能测试
- [ ] 提交到 Git

**交付物**:
- 通过所有测试
- Git commit

---

## 🛠️ 开发规范

### 分支策略

继续使用 Feature Branch 策略：

```bash
main (稳定)
  ├── feature/phase2-infrastructure (阶段 2.1)
  ├── feature/phase2-memory (阶段 2.2)
  ├── feature/phase2-workflow (阶段 2.3)
  ├── feature/phase2-agent (阶段 2.4)
  └── feature/phase2-streaming (阶段 2.5)
```

**规则**:
1. 每个阶段一个分支
2. 完成后合并到 main
3. 测试通过才能合并
4. 保持 main 分支稳定

### Commit 规范

```
feat(phase2-xxx): Add YYY module
fix(phase2-xxx): Fix ZZZ issue
refactor(phase2-xxx): Refactor AAA
test(phase2-xxx): Add tests for BBB
docs(phase2-xxx): Update documentation
```

### Code Review 清单

- [ ] 符合 Clean Architecture 原则
- [ ] 依赖方向正确（向内）
- [ ] 接口定义清晰
- [ ] 单一职责原则
- [ ] 有单元测试
- [ ] 有文档注释
- [ ] TypeScript 类型完整
- [ ] 无 linter 错误

---

## ⚠️ 风险评估

### 技术风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 流处理逻辑复杂 | 高 | 高 | 分阶段重构，充分测试 |
| 多代理协调困难 | 高 | 高 | 引入状态机，使用事件驱动 |
| 性能下降 | 中 | 中 | 性能基准测试，必要时优化 |
| 向后兼容性问题 | 低 | 高 | 保持特性开关，允许回滚 |

### 进度风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 估算不准确 | 中 | 中 | 留出 20% buffer |
| 依赖阻塞 | 低 | 中 | 并行开发，减少依赖 |
| 资源不足 | 低 | 高 | 优先级排序，必要时调整范围 |

---

## 📊 成功标准

### 代码质量

- ✅ 所有代码遵循 Clean Architecture
- ✅ 单元测试覆盖率 ≥ 80%
- ✅ 集成测试覆盖核心流程
- ✅ 无 TypeScript 错误
- ✅ 无 ESLint 错误

### 功能完整性

- ✅ 所有功能正常工作
- ✅ 性能不低于旧架构
- ✅ 错误处理完善
- ✅ 日志完整

### 文档完整性

- ✅ 架构文档
- ✅ API 文档
- ✅ 开发指南
- ✅ 测试文档

---

## 🎯 Phase 2 完成标准

当以下条件全部满足时，Phase 2 宣布完成：

1. **代码**
   - [ ] handlers/ 全部重构完成
   - [ ] services/ 全部重构完成
   - [ ] utils/ 整理完成
   - [ ] 旧代码全部移除（不是注释）

2. **测试**
   - [ ] 单元测试覆盖率 ≥ 80%
   - [ ] 集成测试通过
   - [ ] 性能测试通过
   - [ ] 压力测试通过

3. **文档**
   - [ ] Phase 2 完成总结
   - [ ] 架构文档更新
   - [ ] API 文档更新
   - [ ] 开发指南更新

4. **部署**
   - [ ] 在预生产环境稳定运行 1 周
   - [ ] 无 critical bugs
   - [ ] 性能符合预期

---

## 📞 相关资源

### 文档

- **Phase 1 完成总结**: `docs/CLEAN_ARCHITECTURE_MIGRATION_COMPLETE.md`
- **Phase 1 清理总结**: `docs/PHASE_1_CLEANUP_SUMMARY.md`
- **Phase 2 重构计划**: `docs/PHASE_2_HANDLERS_SERVICES_REFACTORING_PLAN.md`
- **废弃文件说明**: `api/services/_DEPRECATED_README.md`

### 工具

- **DI 容器**: `api/_clean/di-container.ts`
- **特性开关**: `api/lambda/_utils/arch-switch.ts` (Phase 2 后将移除)

### 团队

- **负责人**: Backend Team Lead
- **开发者**: 待分配
- **Code Reviewer**: 待指定

---

## 🚀 准备就绪检查

在开始 Phase 2 之前，确认以下项目：

### 技术准备

- [x] Phase 1 代码已合并到 main
- [x] 服务器稳定运行
- [x] 开发环境正常
- [x] 测试环境可用
- [x] CI/CD 流程正常

### 团队准备

- [ ] 团队成员了解 Phase 2 计划
- [ ] 任务已分配
- [ ] 时间已排期
- [ ] Code Review 流程已建立

### 文档准备

- [x] Phase 2 重构计划已完成
- [x] 开发规范已明确
- [x] 风险评估已完成
- [ ] 团队已学习 Clean Architecture 原则

---

**状态**: 🚀 准备就绪，等待团队确认开始时间  
**最后更新**: 2025年12月31日

