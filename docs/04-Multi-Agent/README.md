# 🤖 04-Multi-Agent（多智能体系统）

## 📌 模块简介

本文件夹包含了基于 LangGraph 的多智能体协作系统的完整设计和实现。多个 AI Agent 分工协作，共同完成复杂任务，这是项目的核心特色功能之一。

## 📚 核心文档

### 1. MULTI_AGENT_IMPLEMENTATION_SUMMARY.md（9KB）
**多智能体实现总结**

**Agent 角色划分：**

```
┌─────────────────────────────────────┐
│         Host Agent (主持人)          │
│   负责协调和控制整体流程              │
└──────────┬──────────────────────────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
┌─────────┐  ┌─────────┐
│ Planner │  │ Reporter│
│ (规划者) │  │ (报告者) │
└────┬────┘  └────┬────┘
     │            │
     └─────┬──────┘
           ▼
     ┌─────────┐
     │  Critic │
     │ (评论家) │
     └─────────┘
```

**各 Agent 职责：**

1. **Host Agent（主持人）**
   - 理解用户意图
   - 分配任务给其他 Agent
   - 协调 Agent 之间的协作
   - 返回最终结果

2. **Planner Agent（规划者）**
   - 制定任务计划
   - 分解复杂任务
   - 确定执行步骤
   - 调用工具执行

3. **Reporter Agent（报告者）**
   - 收集信息
   - 生成报告
   - 总结结果
   - 格式化输出

4. **Critic Agent（评论家）**
   - 评估结果质量
   - 提出改进建议
   - 检查逻辑错误
   - 优化输出

**实现代码示例：**
```typescript
// Host Agent 协调流程
class HostAgent extends BaseAgent {
  async process(input: string) {
    // 1. 理解意图
    const intent = await this.analyzeIntent(input);
    
    // 2. 制定计划
    const plan = await this.plannerAgent.createPlan(intent);
    
    // 3. 执行计划
    const result = await this.executePlan(plan);
    
    // 4. 生成报告
    const report = await this.reporterAgent.generateReport(result);
    
    // 5. 评估优化
    const final = await this.criticAgent.evaluate(report);
    
    return final;
  }
}
```

### 2. MULTI_AGENT_PROTOCOL.md（11KB）
**多智能体协议设计**

**消息协议：**
```typescript
interface AgentMessage {
  type: 'task' | 'result' | 'question' | 'answer';
  from: 'host' | 'planner' | 'reporter' | 'critic';
  to: 'host' | 'planner' | 'reporter' | 'critic';
  content: string;
  metadata?: {
    conversationId: string;
    stepId: string;
    timestamp: number;
  };
}
```

**状态管理：**
```typescript
interface AgentState {
  // 当前执行的 Agent
  currentAgent: string;
  
  // 执行历史
  history: AgentMessage[];
  
  // 中间结果
  intermediateResults: Map<string, any>;
  
  // 全局上下文
  context: {
    userInput: string;
    plan: Plan;
    tools: Tool[];
  };
}
```

**工作流设计：**
```
User Input
    ↓
Host (分析意图)
    ↓
Planner (制定计划)
    ↓
    ├─→ Tool 1 (执行)
    ├─→ Tool 2 (执行)
    └─→ Tool 3 (执行)
    ↓
Reporter (生成报告)
    ↓
Critic (评估)
    ↓
    ├─→ 通过 → 返回结果
    └─→ 不通过 → 重新执行
```

### 3. MULTI_AGENT_STREAMING_PERFORMANCE_OPTIMIZATION.md（22KB）⭐
**多智能体流式性能优化**

这是本模块最重要的文档，详细记录了多智能体场景下的性能优化。

**性能挑战：**
1. **多 Agent 并发**：如何管理多个 Agent 同时执行？
2. **流式输出**：每个 Agent 的输出如何实时显示？
3. **状态同步**：如何保证多个 Agent 的状态一致？
4. **内存占用**：多个 LLM 同时运行内存占用大

**优化方案：**

#### 1. 并发控制
```typescript
// 限制同时运行的 Agent 数量
const agentPool = new Pool({
  max: 3, // 最多 3 个 Agent 并发
  create: () => new Agent(),
  destroy: (agent) => agent.cleanup()
});

// 使用队列管理任务
const taskQueue = new Queue({
  concurrency: 3,
  timeout: 60000
});
```

#### 2. 流式输出优化
```typescript
// 为每个 Agent 创建独立的流
const streams = {
  host: new TransformStream(),
  planner: new TransformStream(),
  reporter: new TransformStream(),
  critic: new TransformStream()
};

// 合并多个流
const mergedStream = mergeStreams(Object.values(streams), {
  preserveOrder: true,
  addMetadata: true
});
```

#### 3. 状态管理优化
```typescript
// 使用 LangGraph 管理状态
import { StateGraph } from '@langchain/langgraph';

const workflow = new StateGraph({
  channels: {
    messages: [],
    currentAgent: null,
    results: {}
  }
});

// 添加节点
workflow.addNode('host', hostAgent);
workflow.addNode('planner', plannerAgent);
workflow.addNode('reporter', reporterAgent);

// 定义边
workflow.addEdge('host', 'planner');
workflow.addEdge('planner', 'reporter');
```

#### 4. 内存优化
```typescript
// 清理不需要的中间结果
const cleanupIntermediateResults = (state: AgentState) => {
  const keepSteps = 5; // 只保留最近 5 步
  if (state.history.length > keepSteps) {
    state.history = state.history.slice(-keepSteps);
  }
};

// LLM 结果缓存
const llmCache = new LRUCache({
  max: 100,
  ttl: 1000 * 60 * 5 // 5 分钟
});
```

**性能提升：**
- ⚡ **响应时间**：从 15s 降低到 8s
- 💾 **内存占用**：减少 50%
- 🚀 **并发能力**：支持 10+ 并发会话
- ✅ **稳定性**：错误率从 5% 降低到 0.5%

## 🎯 关键技术点

### LangGraph 核心概念

#### StateGraph（状态图）
```typescript
// 定义状态
interface MyState {
  messages: BaseMessage[];
  results: Record<string, any>;
}

// 创建状态图
const graph = new StateGraph<MyState>({
  channels: {
    messages: { value: (old, new) => [...old, ...new] },
    results: { value: (old, new) => ({ ...old, ...new }) }
  }
});
```

#### Nodes（节点）
```typescript
// 添加 Agent 节点
graph.addNode('planner', async (state) => {
  const plan = await plannerAgent.run(state.messages);
  return {
    messages: [plan],
    results: { plan: plan.content }
  };
});
```

#### Edges（边）
```typescript
// 条件边
graph.addConditionalEdges(
  'critic',
  (state) => {
    return state.results.score > 0.8 ? 'end' : 'planner';
  },
  {
    'end': END,
    'planner': 'planner'
  }
);
```

### Agent 通信机制

**消息传递：**
```typescript
// Agent 之间通过消息传递通信
const message = {
  type: 'task',
  from: 'host',
  to: 'planner',
  content: '请制定一个搜索计划'
};

await messageQueue.send(message);
```

**共享状态：**
```typescript
// 通过共享状态传递数据
state.results.plan = planResult;
state.results.searchResults = searchResults;
```

## 💡 面试要点

### 1. 多智能体的优势
**问题：为什么使用多智能体而不是单一 Agent？**
- **专业分工**：每个 Agent 专注于特定任务
- **提升质量**：多个视角评估结果
- **并行执行**：提高执行效率
- **易于扩展**：新增 Agent 不影响现有系统

### 2. Agent 协作机制
**问题：Agent 之间如何协作？**
- **消息传递**：通过标准化的消息协议
- **状态共享**：使用 LangGraph 管理共享状态
- **工作流编排**：Host Agent 负责协调
- **错误处理**：失败时可以重试或切换策略

### 3. LangGraph 的作用
**问题：LangGraph 解决了什么问题？**
- **状态管理**：统一管理 Agent 状态
- **流程编排**：可视化的工作流定义
- **条件分支**：根据结果动态选择路径
- **持久化**：支持中断和恢复

### 4. 性能优化
**问题：多智能体如何优化性能？**
- **并发控制**：限制同时运行的 Agent 数量
- **结果缓存**：缓存 LLM 调用结果
- **增量更新**：只传递变化的数据
- **懒加载**：按需加载 Agent

### 5. 实际应用场景
**问题：哪些场景适合多智能体？**
- ✅ **研究报告**：Planner 搜索 → Reporter 总结 → Critic 优化
- ✅ **代码审查**：Reader 分析 → Reviewer 评审 → Advisor 建议
- ✅ **数据分析**：Collector 收集 → Analyzer 分析 → Visualizer 可视化
- ❌ **简单对话**：单一 Agent 就够了

## 🔗 相关模块

- **03-Streaming**：多智能体的流式输出
- **07-Tools-System**：Planner Agent 调用工具
- **08-Data-Management**：共享状态的存储

## 📊 实现效果

### 功能完整性
- ✅ 4 个 Agent 协同工作
- ✅ 支持复杂任务分解
- ✅ 实时流式输出
- ✅ 自动质量评估

### 性能指标
- **平均响应**：8-12s
- **并发支持**：10+ 会话
- **成功率**：99.5%
- **质量评分**：平均 8.5/10

### 用户体验
- ✅ 看到每个 Agent 的思考过程
- ✅ 结果质量明显提升
- ✅ 复杂问题处理能力增强

---

**建议阅读顺序：**
1. `MULTI_AGENT_IMPLEMENTATION_SUMMARY.md` - 理解整体设计
2. `MULTI_AGENT_PROTOCOL.md` - 学习通信协议
3. `MULTI_AGENT_STREAMING_PERFORMANCE_OPTIMIZATION.md` - 掌握性能优化

**相关代码文件：**
- `api/agents/hostAgent.ts` - Host Agent 实现
- `api/agents/plannerAgent.ts` - Planner Agent
- `api/workflows/multiAgentOrchestrator.ts` - 工作流编排

