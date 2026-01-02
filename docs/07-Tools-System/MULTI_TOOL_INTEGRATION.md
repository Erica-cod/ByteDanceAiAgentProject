# 多工具调用集成文档

## 📋 功能概述

成功将 **多工具调用工作流** 集成到 chat.ts，现在系统可以：

1. ✅ **自动检测工具调用** - AI 回复中的工具调用会被自动识别
2. ✅ **执行工具并返回结果** - 工具执行结果自动反馈给 AI
3. ✅ **多轮迭代** - AI 可以根据工具结果继续调用其他工具（最多5轮）
4. ✅ **流式响应** - 整个过程保持流式输出，用户体验流畅
5. ✅ **智能错误处理** - 工具调用错误时允许 AI 修正并重试（最多2次连续错误）
6. ✅ **防护机制** - 连续错误超限后自动终止，防止无限循环

## 🎯 重要更新

### ⚠️ 已移除的限制
- ❌ ~~每次只能调用一个工具~~ （已移除）
- ✅ **现在支持多轮工具调用**

### ✅ 新增能力
- 🔄 **多步骤工作流**：先搜索，再创建计划
- 🔁 **错误重试**：工具调用错误时可以修正并重试
- 📊 **完整数据返回**：`list_plans` 返回完整的 tasks 数组

---

## 🏗️ 架构设计

### 核心组件

```
┌─────────────────────────────────────────────────────────┐
│                     chat.ts (主入口)                     │
│  - 接收用户消息                                          │
│  - 调用 AI 模型                                          │
│  - 集成 MultiToolCallManager                             │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│         chatWorkflowIntegration.ts (工作流管理)          │
│  - MultiToolCallManager: 管理多轮工具调用               │
│  - processSingleToolCall: 处理单次工具调用               │
│  - extractToolCall: 从 AI 回复中提取工具调用             │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│              工具层 (Tool Layer)                         │
│  - toolValidator.ts: 验证工具调用                        │
│  - tavilySearch.ts: 搜索工具                             │
│  - planningTools.ts: 计划管理工具                        │
└─────────────────────────────────────────────────────────┘
```

---

## 🔄 工作流程

### 单次对话中的多工具调用流程

```
用户输入
  ↓
[1] AI 模型生成回复（可能包含工具调用）
  ↓
[2] MultiToolCallManager 检测工具调用
  ↓
  ├─ 没有工具 → 直接返回给用户
  │
  └─ 有工具调用
       ↓
     [3] 执行工具（search_web / create_plan / 等）
       ↓
     [4] 将工具结果反馈给 AI
       ↓
     [5] AI 根据工具结果决定下一步
       ↓
       ├─ 继续调用其他工具 → 回到 [2]
       │
       └─ 给出最终回复 → 返回给用户
```

### 示例场景

**用户**: 搜索 IELTS 7分需要什么水平，然后帮我制定一个详细的学习计划

```
轮次1: AI 决定搜索
  → 调用 search_web("IELTS 7分水平")
  → 获得搜索结果

轮次2: AI 基于搜索结果决定创建计划
  → 调用 create_plan({...})
  → 创建成功

轮次3: AI 给出最终回复
  → 向用户展示计划
```

---

## 🛠️ 技术实现

### 1. 工具调用检测

```typescript
// 提取工具调用（支持多种格式）
function extractToolCall(text: string): any | null {
  // 1. 匹配 <tool_call>...</tool_call> 标签
  const tagRegex = /<tool_call>([\s\S]*?)<\/tool_call>/;
  
  // 2. 匹配纯 JSON 格式 {"tool": "xxx", ...}
  const jsonMatch = text.match(/\{[\s\S]*?"tool"\s*:\s*"[^"]+"[\s\S]*?\}/);
  
  // 3. 解析并返回
  return JSON.parse(cleanedJson);
}
```

### 2. 多轮调用管理

```typescript
class MultiToolCallManager {
  private history: ToolCallRecord[] = [];
  private currentIteration = 0;
  private maxIterations = 5;
  
  async processAIResponse(aiResponse: string, userId: string): Promise<WorkflowResult> {
    // 1. 提取工具调用
    const toolCall = extractToolCall(aiResponse);
    if (!toolCall) return { hasToolCall: false };
    
    // 2. 验证工具调用
    const validation = validateToolCall(toolCall);
    
    // 3. 执行工具
    const result = await executeTool(toolCall, userId);
    
    // 4. 记录历史
    this.history.push({ tool, result, timestamp: new Date() });
    
    return { hasToolCall: true, toolResult: result, shouldContinue: true };
  }
}
```

### 3. chat.ts 集成

```typescript
// chat.ts 中的集成
const workflowManager = new MultiToolCallManager(5);
let currentResponse = accumulatedText;
let continueLoop = true;

while (continueLoop) {
  // 处理当前 AI 回复
  const workflowResult = await workflowManager.processAIResponse(currentResponse, userId);
  
  if (!workflowResult.hasToolCall) {
    break; // 没有工具调用，结束
  }
  
  // 执行工具
  console.log(`🔧 执行工具: ${workflowResult.toolCall?.tool}`);
  
  // 将工具结果反馈给 AI
  messages.push(
    { role: 'assistant', content: currentResponse },
    { role: 'user', content: `工具结果: ${workflowResult.toolResult}` }
  );
  
  // 重新调用 AI
  const newStream = await callVolcengineModel(messages);
  
  // 处理新的流式响应
  for await (const chunk of newStream) {
    currentResponse += chunk;
    // 实时发送给前端...
  }
}
```

---

## 📊 测试结果

### 测试场景

| 场景 | 描述 | 结果 |
|------|------|------|
| 场景1 | 单个工具调用（搜索） | ✅ 通过 |
| 场景2 | 多轮工具调用（搜索→创建计划） | ✅ 通过 |
| 场景3 | 无工具调用 | ✅ 通过 |
| 场景4 | 无效工具调用 | ✅ 通过（正确捕获错误） |
| 场景5 | 计划工具多轮调用（创建→列表→查询→更新） | ✅ 通过 |

### 运行测试

```bash
# 测试多工具调用基础功能
npx tsx api/workflows/testMultiToolWorkflow.ts

# 测试计划工具多轮调用
npx tsx api/workflows/testPlanningWorkflow.ts
```

---

## 🎯 使用示例

### 在聊天界面测试

1. **搜索 + 创建计划**
   ```
   用户: 搜索 IELTS 备考方法，然后帮我制定一个3个月的学习计划
   ```
   
   AI 会：
   - 第1轮：调用 `search_web` 搜索
   - 第2轮：基于搜索结果调用 `create_plan` 创建计划
   - 第3轮：向用户展示最终计划

2. **列表 + 更新计划**
   ```
   用户: 先列出我所有的计划，然后帮我更新第一个计划的目标为达到8分
   ```
   
   AI 会：
   - 第1轮：调用 `list_plans` 获取所有计划
   - 第2轮：调用 `update_plan` 更新第一个计划
   - 第3轮：确认更新结果

3. **搜索 + 搜索 + 创建计划**（复杂场景）
   ```
   用户: 搜索雅思阅读技巧，再搜索写作提升方法，然后综合制定学习计划
   ```
   
   AI 会：
   - 第1轮：搜索阅读技巧
   - 第2轮：搜索写作方法
   - 第3轮：综合创建计划
   - 第4轮：展示最终结果

---

## ⚙️ 配置与限制

### 配置参数

```typescript
const workflowManager = new MultiToolCallManager(
  5  // maxIterations: 最大迭代次数，防止无限循环
);
```

### 安全限制

1. **最大迭代次数**: 5轮
   - 防止 AI 陷入无限循环
   - 如果达到上限，工作流自动终止

2. **工具验证**: 所有工具调用必须通过验证
   - 检查工具是否存在
   - 检查必需参数是否提供
   - 检查参数类型是否正确

3. **错误处理**: 工具执行失败时优雅降级
   - 错误信息返回给 AI
   - 工作流终止，避免错误传播

---

## 🚀 后续扩展

### 可能的增强功能

1. **并行工具调用**
   - 当 AI 需要同时调用多个独立工具时，可以并行执行
   - 例如：同时搜索多个关键词

2. **工具调用缓存**
   - 对相同的工具调用结果进行缓存
   - 避免重复搜索相同的内容

3. **更复杂的决策逻辑**
   - 引入 LangGraph 的条件边（Conditional Edges）
   - 支持更复杂的工作流编排

4. **工具执行监控**
   - 记录工具调用的性能指标
   - 分析工具使用模式

5. **多 Agent 协作**
   - 利用 LangGraph 的状态管理
   - 实现多个 Agent 之间的协作

---

## 📝 注意事项

1. **流式响应**: 整个工作流保持流式输出，用户可以实时看到进度

2. **消息历史管理**: 每次工具调用后，AI 的回复和工具结果都会添加到消息历史中

3. **前端渲染**: 
   - 工具调用通知会立即发送给前端
   - 计划数据会通过 PlanCard 组件渲染
   - 搜索结果会以 markdown 格式展示

4. **API Key**: 
   - 搜索功能需要 TAVILY_API_KEY
   - 计划工具不需要额外配置

---

## 🔗 相关文档

- [工具验证器文档](./TOOL_VALIDATOR_GUIDE.md)
- [计划工具文档](./PLANNING_TOOLS_GUIDE.md)
- [LangGraph 工作流原理](./LANGGRAPH_PRINCIPLES.md)
- [LangGraph 工作流指南](./LANGGRAPH_WORKFLOW_GUIDE.md)

---

## ✅ 总结

这次集成实现了：

1. ✅ **完整的多工具调用支持** - AI 可以连续调用多个工具
2. ✅ **流式响应保持** - 整个过程保持实时输出
3. ✅ **健壮的错误处理** - 优雅处理各种异常情况
4. ✅ **良好的测试覆盖** - 多个测试场景验证功能
5. ✅ **可扩展的架构** - 易于添加新工具和新功能

现在可以在聊天界面体验强大的多工具协作功能了！🎉

