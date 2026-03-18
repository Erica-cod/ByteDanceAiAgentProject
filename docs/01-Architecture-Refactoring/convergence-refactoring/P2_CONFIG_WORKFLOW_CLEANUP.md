# P2 架构优化：规则外部化、遗留工作流清理、管理端鉴权

## 一、问题背景

P0 消除了重复实现，P1 降低了核心模块复杂度。P2 处理剩余的架构治理项：

1. **`request-classifier.ts` 和 `tool-registry.ts` 中的正则/规则硬编码在代码里**，新增关键词需要改源码，不利于运维和快速调整。
2. **三个遗留工作流文件形成孤岛（无外部调用者）**：`workflowProcessor.ts`、`chatWorkflowIntegration.ts`、`agentWorkflow.ts`。它们是旧的"从 AI 回复文本中正则提取 `<tool_call>` 标签"方案，已被原生 Function Calling（`singleAgentHandler.ts` → `toolExecutor`）完全取代。
3. **`tool-system-status` POST 端点缺少管理员鉴权**，任何人都能重置缓存/指标/熔断器。

### 遗留工作流引用链

```
workflowProcessor.ts → chatWorkflowIntegration.ts (MultiToolCallManager)
agentWorkflow.ts     → chatWorkflowIntegration.ts (processSingleToolCall 风格)
                     → 但两者均无外部调用方
```

---

## 二、方案设计

### P2-1: 规则外部化

将 `request-classifier.ts` 的 4 组正则和 `tool-registry.ts` 的 `getRelevantSchemas` 规则提取到 `api/config/classifierRules.ts` 和 `api/config/toolRelevanceRules.ts`。

好处：
- 调整分类阈值/关键词只改配置文件，不动核心逻辑
- 未来可改为从数据库/远程配置中心加载

### P2-2: 清理遗留工作流

三个文件均无外部调用者（grep 确认），属于被原生 Function Calling 取代的旧方案。

方案：直接删除这三个文件。它们的核心能力（工具执行 + 多轮循环）已由 `singleAgentHandler.ts` 的 `handleAgentStream` + `executeToolCalls` 实现。

删除文件：
- `api/handlers/workflowProcessor.ts`
- `api/workflows/chatWorkflowIntegration.ts`
- `api/workflows/agentWorkflow.ts`

### P2-3: tool-system-status 管理员鉴权

在 POST 端点添加登录会话检查，复用已有的 `getBffSessionFromHeaders`。生产环境下未登录用户直接返回 403。

---

## 三、实现计划

### Step 1: 规则外部化

新增文件：
- `api/config/classifierRules.ts` — 分类器正则和阈值配置
- `api/config/toolRelevanceRules.ts` — 工具瘦身规则配置

改动文件：
- `api/_clean/infrastructure/llm/request-classifier.ts` — 引用配置而非硬编码
- `api/tools/core/registry/tool-registry.ts` — 引用配置而非硬编码

### Step 2: 删除遗留工作流

删除文件：
- `api/handlers/workflowProcessor.ts`
- `api/workflows/chatWorkflowIntegration.ts`
- `api/workflows/agentWorkflow.ts`

### Step 3: 管理员鉴权

改动文件：
- `api/lambda/tool-system-status.ts` — POST 添加 session 校验

---

## 四、效果验证

- [ ] `request-classifier.ts` 不再包含正则字面量（全部来自配置）
- [ ] `tool-registry.ts` 的 `getRelevantSchemas` 不再包含硬编码的工具名映射
- [ ] 三个遗留工作流文件已删除，无残留引用
- [ ] `POST /api/tool-system-status` 未登录返回 403
- [ ] 无 lint 错误，现有功能正常
