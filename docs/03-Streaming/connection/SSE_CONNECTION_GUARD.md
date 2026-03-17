# SSE连接断开保护机制

> 2025-12-28 防止前端刷新后后端继续浪费token

---

## 🎯 问题描述

### 场景
用户在多Agent讨论过程中刷新页面 → SSE连接断开 → 后端仍在继续调用LLM生成内容 → **白白浪费token和资源**

### 影响
- **Token浪费**：每轮讨论可能消耗数千token，5轮讨论可能浪费上万token
- **资源浪费**：CPU、内存、LLM API调用都在做无用功
- **成本增加**：特别是使用付费LLM API时

---

## ✅ 解决方案

### 核心思路
在 `MultiAgentOrchestrator` 的主循环和每个Agent生成前，检查SSE连接状态，如果断开则立即停止生成。

### 实现细节

#### 1. 添加连接检查器到配置

```typescript
// api/workflows/multiAgentOrchestrator.ts
export interface OrchestratorConfig {
  maxRounds?: number;
  userId: string;
  conversationId: string;
  resumeFromRound?: number;
  initialState?: Partial<MultiAgentSession>;
  connectionChecker?: () => boolean; // ✅ 新增：连接状态检查器
}
```

#### 2. 在Orchestrator中保存检查器

```typescript
export class MultiAgentOrchestrator {
  private connectionChecker?: () => boolean; // ✅ 连接状态检查器

  constructor(config: OrchestratorConfig, callbacks: OrchestratorCallbacks = {}) {
    this.connectionChecker = config.connectionChecker;
    // ...
  }
}
```

#### 3. 在主循环开始时检查

```typescript
async run(userQuery: string, resumeFromRound?: number): Promise<MultiAgentSession> {
  try {
    for (let round = startRound; round <= this.session.max_rounds; round++) {
      // ✅ 检查连接状态（防止前端刷新后继续浪费token）
      if (this.connectionChecker && !this.connectionChecker()) {
        console.warn(`⚠️  [Orchestrator] 检测到SSE连接断开，停止生成（第 ${round} 轮）`);
        this.session.status = 'terminated';
        break;
      }
      
      // ... 继续执行
    }
  }
}
```

#### 4. 在每个Agent生成前检查

```typescript
// Planner生成前
if (this.connectionChecker && !this.connectionChecker()) {
  console.warn(`⚠️  [Orchestrator] 连接断开，跳过Planner生成`);
  break;
}

// Critic生成前
if (this.connectionChecker && !this.connectionChecker()) {
  console.warn(`⚠️  [Orchestrator] 连接断开，跳过Critic生成`);
  break;
}

// Host生成前
if (this.connectionChecker && !this.connectionChecker()) {
  console.warn(`⚠️  [Orchestrator] 连接断开，跳过Host生成`);
  break;
}

// Reporter生成前
if (this.connectionChecker && !this.connectionChecker()) {
  console.warn(`⚠️  [Orchestrator] 连接断开，跳过Reporter生成`);
  this.session.status = 'terminated';
  return this.session;
}
```

#### 5. 在Handler中传递检查器

```typescript
// api/handlers/multiAgentHandler.ts
const orchestrator = new MultiAgentOrchestrator(
  {
    maxRounds: 5,
    userId,
    conversationId,
    resumeFromRound: actualResumeFromRound,
    initialState: initialState,
    // ✅ 传递连接检查器（防止前端刷新后继续浪费token）
    connectionChecker: () => !sseWriter.isClosed(),
  },
  {
    // ... callbacks
  }
);
```

---

## 🔒 数据安全保证

### 已有的保护机制

即使连接断开，已完成的轮次状态仍会保存到MongoDB：

```typescript
// api/handlers/multiAgentHandler.ts
onRoundComplete: async (round: number) => {
  // ✅ 保存当前状态到 MongoDB（断点续传）
  // 🔴 关键修复：即使客户端断开连接，也要保存状态！
  if (clientAssistantMessageId) {
    try {
      const currentSession = orchestrator.getSession();
      await MultiAgentSessionService.saveState(
        conversationId,
        userId,
        clientAssistantMessageId,
        {
          completedRounds: round,
          sessionState: currentSession,
          userQuery: userQuery,
        }
      );
    } catch (error) {
      console.error('❌ [MultiAgent] 保存状态到 MongoDB 失败:', error);
    }
  }
  
  // 只有连接还在时才发送 SSE 事件
  if (sseWriter.isClosed()) {
    console.log(`⚠️  [SSE] 客户端已断开，但状态已保存到 MongoDB (第 ${round} 轮)`);
    return;
  }
  
  await sseWriter.sendEvent({
    type: 'round_complete',
    round,
    timestamp: new Date().toISOString(),
  });
},
```

### 断点续传支持

用户刷新页面后，可以从上次完成的轮次继续：

```typescript
// 前端发送 resumeFromRound 参数
const response = await fetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify({
    message: userQuery,
    mode: 'multi_agent',
    resumeFromRound: 3, // 从第3轮继续
    // ...
  })
});
```

---

## 📊 效果评估

### Token节省

假设每个Agent生成平均消耗500 token：

| 场景 | 无保护 | 有保护 | 节省 |
|------|--------|--------|------|
| 第1轮后刷新 | 4轮 × 4 Agents × 500 = 8000 token | 0 token | **8000 token** |
| 第2轮后刷新 | 3轮 × 4 Agents × 500 = 6000 token | 0 token | **6000 token** |
| 第3轮后刷新 | 2轮 × 4 Agents × 500 = 4000 token | 0 token | **4000 token** |

### 响应时间

- **检查开销**：< 1ms（简单的布尔检查）
- **提前终止收益**：节省数秒到数十秒的LLM调用时间

---

## 🧪 测试场景

### 1. 正常流程
- 用户发起多Agent讨论
- 5轮讨论正常完成
- 生成最终报告
- ✅ 所有Agent都正常生成

### 2. 第1轮后刷新
- 用户发起多Agent讨论
- Planner生成完成
- 用户刷新页面
- ✅ Critic、Host、Reporter不再生成
- ✅ 第1轮状态已保存到MongoDB

### 3. 第2轮中途刷新
- 用户发起多Agent讨论
- 第1轮完成
- 第2轮Planner生成中
- 用户刷新页面
- ✅ 第2轮的Critic、Host不再生成
- ✅ 第1轮状态已保存到MongoDB

### 4. 断点续传
- 用户刷新页面后
- 重新发送请求，带上 `resumeFromRound: 2`
- ✅ 从第2轮继续，不重复第1轮

---

## 🎯 最佳实践

### 1. 前端实现

```typescript
// 监听页面卸载
useEffect(() => {
  const handleBeforeUnload = () => {
    // 可以在这里保存当前轮次到localStorage
    localStorage.setItem('lastCompletedRound', currentRound.toString());
  };
  
  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [currentRound]);

// 页面加载时检查是否需要续传
useEffect(() => {
  const lastRound = localStorage.getItem('lastCompletedRound');
  if (lastRound) {
    // 提示用户是否继续
    setResumeFromRound(parseInt(lastRound) + 1);
  }
}, []);
```

### 2. 后端日志

```typescript
// 连接断开时的日志
console.warn(`⚠️  [Orchestrator] 检测到SSE连接断开，停止生成（第 ${round} 轮）`);
console.log(`⚠️  [SSE] 客户端已断开，但状态已保存到 MongoDB (第 ${round} 轮)`);
```

### 3. 监控指标

建议监控以下指标：
- **连接断开率**：SSE连接断开的频率
- **Token节省量**：因提前终止节省的token数
- **断点续传使用率**：用户使用断点续传的频率

---

## 🔍 相关文件

- `api/workflows/multiAgentOrchestrator.ts` - 主要实现
- `api/handlers/multiAgentHandler.ts` - 连接检查器传递
- `api/utils/sseStreamWriter.ts` - SSE流状态管理
- `api/services/multiAgentSessionService.ts` - 状态保存

---

## 📝 总结

通过在多Agent协作流程中添加连接断开检测，我们实现了：

1. ✅ **Token节省**：前端刷新后立即停止生成，避免浪费
2. ✅ **资源优化**：减少无效的LLM API调用
3. ✅ **数据安全**：已完成的轮次仍会保存到MongoDB
4. ✅ **断点续传**：用户可以从上次完成的轮次继续
5. ✅ **零性能开销**：检查仅需 < 1ms

这是一个**低成本、高收益**的优化，特别适合多轮对话和长时间生成的场景。

---

**实现日期：** 2025-12-28  
**状态：** ✅ 已完成并测试

