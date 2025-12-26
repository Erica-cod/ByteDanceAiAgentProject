# 前端实习面试准备 - AI Agent 项目

## 📌 项目架构速览（30 秒电梯演讲）

这是一个**多智能体对话系统**，支持：
- **前端**：React + TypeScript，SSE 流式输出，虚拟列表，状态管理
- **后端**：Modern.js BFF + PostgreSQL，支持单 Agent（多工具循环）和多 Agent（辩论式编排）
- **核心技术点**：流式渲染、工具调用、会话记忆、状态持久化

---

## 🔥 4 个难点题（可选）+ 解决方案 + 业内对比

### 难点 1：**流式输出（SSE）+ 打字机 UI + 智能滚动**

#### 🎯 **为什么难**
- **性能冲突**：每个 token 触发一次 re-render，会导致频繁重排（Layout Thrashing）
- **用户体验冲突**：自动滚动 vs 用户主动上滑阅读
- **状态管理复杂**：流式 delta、工具调用通知、思考链、错误处理要分层

#### 💡 **你的解决方案（可落地）**
1. **事件分层**：把流式事件分成 `init / delta(content|thinking) / tool_status / done / error`
   - 前端用 **reducer 模式**只更新"最后一条消息"的局部字段，避免全量 re-render
   ```ts
   // 伪代码
   case 'delta':
     setMessages(prev => {
       const last = prev[prev.length - 1];
       return [...prev.slice(0, -1), { ...last, content: last.content + delta }];
     });
   ```

2. **滚动策略**：
   - 用 **`react-virtuoso` 的 `followOutput` 回调**：只有用户在"底部阈值"（最后 50px）才自动滚动
   - 用户上滑后锁定滚动，显示"↓ 新消息"按钮让用户主动跳回
   ```ts
   const followOutput = (isAtBottom: boolean) => {
     return isAtBottom ? 'smooth' : false; // 只在底部时 follow
   };
   ```

3. **性能优化**：
   - **节流批量更新**：用 `requestAnimationFrame` 合并连续 delta（每 16ms 更新一次）
   - **虚拟化**：消息列表超过 200 条时只渲染可见区域（`react-virtuoso`）
   - **Markdown 懒加载**：思考链（Thinking）默认折叠，用户点击才渲染

4. **断线容错**：
   - `AbortController` 取消上一个未完成的请求
   - 用 `conversationId + clientMessageId` 做幂等对齐，避免重复插入

#### 🌍 **业内其他方案**
| 方案 | 代表产品 | 优点 | 缺点 | 为什么我没选 |
|------|----------|------|------|--------------|
| **WebSocket 双向通信** | ChatGPT (早期) | 双向推送、心跳检测 | 需要独立 WS 服务器、状态管理复杂 | BFF 场景 SSE 更轻量 |
| **Server-Sent Events (SSE)** | Claude、DeepSeek | 单向推送、基于 HTTP、自动重连 | 单向通信、IE 不支持（但已无所谓） | ✅ 我选这个：简单、HTTP/2 复用 |
| **Long Polling** | 早期 AJAX 聊天 | 兼容性最好 | 延迟高、服务器压力大 | 2025 年不考虑 |
| **GraphQL Subscription** | Hasura、Apollo | 类型安全、支持复杂查询 | 需要 GraphQL 服务端 | 杀鸡用牛刀 |

#### ✅ **为什么选 SSE（形成闭环）**
- **技术栈匹配**：Modern.js BFF 原生支持 SSE，不需要额外的 WebSocket 服务器
- **HTTP/2 复用**：SSE 走 HTTP，可以和 REST API 共享连接池
- **简单可靠**：浏览器自动重连（`EventSource`），状态管理比 WS 简单

---

#### 🔥 **补充：SSE 中断容错机制（面试必问）**

##### **后端容错（3 层防御）**
1. **`safeWrite` 安全写入**：捕获 `AbortError` / `ERR_STREAM_PREMATURE_CLOSE`，防止客户端断开后继续写
2. **错误推送**：如果是服务端错误（非客户端主动断开），发送 `{ error: 'xxx' }` 事件给前端
3. **资源清理**：`finally` 块确保清理心跳定时器 + 释放并发名额（零泄漏）

##### **前端重连（指数退避）**
- 最多重连 **5 次**：1s → 2s → 4s → 8s → 16s（带随机 jitter）
- **尊重 429**：如果服务端返回 `Retry-After`，按指定时间重连
- **用户提示**：重连时在 `thinking` 字段显示"连接中断，正在尝试重连..."

##### **已返回内容完整保留**（核心答案）
- 前端用**增量更新**模式（`content += delta`），不是覆盖
- 重连时只更新提示信息，**不清空已有内容**
- 用户随时可以点"停止"按钮，当前内容会保存到数据库

##### **面试答题速答**
> **面试官**：SSE 中断了怎么办？已经返回的内容会丢失吗？  
> **你**：不会丢失。后端用 `safeWrite` 捕获断线错误，前端自动重连（最多 5 次，指数退避），已推送的内容通过**增量更新**模式保留。重连成功后继续追加，用户体验是"无缝衔接"。

---

### 难点 2：**消息列表"无限长"+ 虚拟列表 + 本地缓存对齐**

#### 🎯 **为什么难**
- **数据量**：聊天历史可能上千条（DOM 爆炸）
- **操作交织**：分页加载 + 流式新增 + 删除会话 + 切换会话
- **状态一致性**：服务端数据 vs 本地缓存 vs 正在发送的消息（3 个 source）

#### 💡 **你的解决方案（可落地）**
1. **虚拟化**：用 `react-virtuoso` 只渲染可视区域
   - 支持"反向滚动"（`initialTopMostItemIndex`）：新消息在底部追加，滚动到顶部时加载历史
   ```tsx
   <Virtuoso
     data={messages}
     initialTopMostItemIndex={messages.length - 1} // 从底部开始
     firstItemIndex={firstItemIndex} // 分页偏移
     startReached={loadMoreHistory} // 滚动到顶部时加载
   />
   ```

2. **本地缓存 + 乐观更新**：
   - 用户发送消息时立即显示（带 `clientMessageId`），不等服务器响应
   - 服务器返回 `serverMessageId` 后做"对齐合并"（避免重复）
   ```ts
   // conversationCache.ts
   export function mergeServerMessages(local: Message[], server: Message[]) {
     const merged = [...server];
     local.forEach(msg => {
       if (msg.clientMessageId && !server.some(s => s.clientMessageId === msg.clientMessageId)) {
         merged.push(msg); // 服务端还没有的，保留本地乐观更新
       }
     });
     return merged.sort((a, b) => a.timestamp - b.timestamp);
   }
   ```

3. **分页策略**：
   - **首屏**：加载最新 50 条
   - **向上滚动**：每次再加载 50 条（`offset + limit`）
   - **去重**：用 `Set<messageId>` 防止分页重复

4. **状态机管理**：
   ```ts
   type LoadingState = 'idle' | 'loading' | 'loadingMore' | 'streaming';
   ```
   - `loadingMore` 时禁止触发新的 `startReached`（防止重复请求）

#### 🌍 **业内其他方案**
| 方案 | 代表产品 | 优点 | 缺点 | 为什么我没选 |
|------|----------|------|------|--------------|
| **React Query / TanStack Query** | 很多现代应用 | 自动缓存、重试、失效策略 | 需要改造 API 层、学习成本 | 项目已中后期，改动成本高 |
| **Redux + RTK Query** | 大型企业应用 | 集中状态、DevTools、时间旅行 | 样板代码多、overkill | 没必要引入全局状态库 |
| **SWR (Vercel)** | Next.js 应用 | 轻量、自动重新验证 | 对复杂场景（多 source）支持弱 | 不适合"乐观更新+SSE"混合场景 |
| **自研缓存 + useState** | ✅ 我的选择 | 完全可控、精准优化 | 要自己处理边界情况 | - |

#### ✅ **为什么选自研缓存（形成闭环）**
- **场景特殊**：聊天应用需要"乐观更新 + 流式追加 + 分页加载"三者并存，通用库都不完美
- **性能优化**：可以针对"只更新最后一条消息"做精准优化（React Query 做不到这个粒度）
- **学习成本**：团队熟悉 React 原生 API，不需要学新库

---

### 难点 3：**工具调用（Function Calling）的 JSON 容错与幻觉防御**

#### 🎯 **为什么难**
- **模型不稳定**：大模型有时会输出不合法的 JSON（缺引号、多逗号、中文引号、未闭合括号）
- **幻觉问题**：模型会"编造"不存在的工具或参数
- **流式场景**：JSON 可能还没传输完整，要处理"未闭合标签"

#### 💡 **你的解决方案（可落地）**
1. **多策略提取**（刚刚重构的 `jsonExtractor.ts`）：
   - 策略 1：匹配 ` ```json ... ``` `
   - 策略 2：匹配 `<tool_call> ... </tool_call>`
   - 策略 3：匹配未闭合标签（流式场景）
   - 策略 4：直接提取裸 JSON（通过括号匹配）

2. **自动修复**（`fixCommonJSONErrors`）：
   - 移除 BOM、零宽字符
   - 修复尾随逗号 `{a:1,}` → `{a:1}`
   - 补全缺失的 `}` 和 `]`
   - 替换中文引号、单引号

3. **防幻觉**（`toolValidator.ts`）：
   - **白名单校验**：只允许 `['search', 'createPlan', 'updatePlan', 'deletePlan', 'getPlans']`
   - **参数校验**：检查必需字段（如 `search` 必须有 `query`）
   - **Prompt 约束**：在系统提示词里列出工具 schema
   ```ts
   export function validateToolCall(toolCall: any): { valid: boolean; error?: string } {
     if (!ALLOWED_TOOLS.includes(toolCall.tool)) {
       return { valid: false, error: `未知工具: ${toolCall.tool}` };
     }
     // 进一步校验参数...
   }
   ```

4. **用户反馈闭环**：
   - 工具调用失败时，把错误信息作为"下一轮的 user 消息"塞回给模型
   - 让模型"自我纠正"（类似 ReAct 模式）

#### 🌍 **业内其他方案**
| 方案 | 代表产品/框架 | 优点 | 缺点 | 为什么我没选 |
|------|--------------|------|------|--------------|
| **OpenAI Function Calling** | GPT-4 | 官方支持、JSON Schema 校验 | 只支持 OpenAI 模型 | 我用的是火山引擎 Doubao |
| **LangChain StructuredOutputParser** | LangChain | 多模型兼容、Zod schema | 重量级、依赖 LangChain | 不想引入整个框架 |
| **Anthropic Tool Use** | Claude 3.5 | 原生支持 XML 格式、鲁棒性好 | 只支持 Claude | 多模型兼容性差 |
| **Pydantic / Zod 强类型校验** | 多框架 | 类型安全、IDE 提示 | 需要维护两套 schema（TS + Prompt） | ✅ 我部分采用（`toolValidator`） |
| **Guardrails AI** | NeMo Guardrails | 防幻觉、防注入 | Python only、复杂 | Node.js 生态 |

#### ✅ **为什么选自研提取+校验（形成闭环）**
- **多模型兼容**：既支持火山引擎（自定义格式），也能适配 Ollama 本地模型
- **轻量级**：不依赖 LangChain 等重框架，单文件 380 行搞定
- **可调试**：每一步都有详细日志，出问题能快速定位

---

### 难点 4：**多智能体辩论的状态同步 + 前端实时展示**

#### 🎯 **为什么难**
- **并发复杂**：Planner → Critic → Host → Reporter 四个 Agent 顺序执行，每个都要流式输出
- **状态爆炸**：每轮有 4 个 Agent 输出 + 共识趋势 + Host 决策，前端要"分区展示"
- **一致性问题**：SSE 流式事件（`onAgentOutput`、`onHostDecision`、`onConsensus`）的顺序和完整性

#### 💡 **你的解决方案（可落地）**
1. **后端：状态机编排**（`multiAgentOrchestrator.ts`）：
   ```ts
   class MultiAgentOrchestrator {
     async *runDebate(userMessage: string) {
       for (let round = 1; round <= maxRounds; round++) {
         // 1. Planner 生成方案
         const plannerOutput = await this.plannerAgent.generate(...);
         yield { type: 'agent_output', data: plannerOutput };
         
         // 2. Critic 批评
         const criticOutput = await this.criticAgent.generate(...);
         yield { type: 'agent_output', data: criticOutput };
         
         // 3. Host 决策
         const hostDecision = await this.hostAgent.decide(...);
         yield { type: 'host_decision', data: hostDecision };
         
         if (hostDecision.action === 'FINALIZE') break;
         
         // 4. 计算共识趋势
         yield { type: 'consensus_trend', data: this.calculateTrend() };
       }
     }
   }
   ```

2. **前端：分层渲染**（`MultiAgentDisplay.tsx`）：
   - 用 **Accordion 折叠面板**展示每轮辩论
   - 每个 Agent 的输出用**卡片 + 头像 + 标签**区分
   - **共识趋势图**：用 `recharts` 画折线图（相似度随轮次的变化）
   ```tsx
   <div className="multi-agent-rounds">
     {rounds.map((round, idx) => (
       <Accordion key={idx}>
         <AccordionSummary>轮次 {idx + 1}</AccordionSummary>
         <AccordionDetails>
           <AgentCard agent="planner" output={round.planner} />
           <AgentCard agent="critic" output={round.critic} />
           <HostDecisionCard decision={round.hostDecision} />
         </AccordionDetails>
       </Accordion>
     ))}
     <ConsensusChart data={consensusTrend} />
   </div>
   ```

3. **容错与重试**：
   - 如果某个 Agent 超时（30s），自动用"默认输出"填充
   - 前端显示 `⚠️ Agent 超时` 标签

#### 🌍 **业内其他方案**
| 方案 | 代表产品/框架 | 优点 | 缺点 | 为什么我没选 |
|------|--------------|------|------|--------------|
| **AutoGen (Microsoft)** | AutoGen | 成熟、支持群聊、工具调用 | Python only、重量级 | Node.js 生态 |
| **CrewAI** | CrewAI | Task 分配、角色定义清晰 | Python only、文档少 | Node.js 生态 |
| **LangGraph Multi-Agent** | LangGraph | 图编排、断点续传 | 学习曲线陡峭 | ✅ 我部分借鉴（StateGraph 思想） |
| **Semantic Kernel Agent Framework** | Microsoft | .NET/Python/Java 多语言 | 社区小、迭代慢 | 文档不全 |
| **OpenAI Assistants API** | OpenAI | 官方支持、托管状态 | 黑盒、不透明、多模型兼容差 | 想要可控性 |
| **Swarm (Anthropic)** | Anthropic | 轻量、支持动态路由 | Python only、实验性 | 不适合 TypeScript |

#### ✅ **为什么选自研编排（形成闭环）**
- **灵活性**：可以完全控制 Agent 交互逻辑（辩论模式、共识计算、提前终止）
- **透明性**：每一步都有日志、可调试，不像 Assistants API 黑盒
- **TypeScript 生态**：项目全栈 TS，自研可以共享类型定义
- **学习成本**：借鉴 LangGraph 的 StateGraph 思想，但简化了（不需要完整的图编排）

---

## 🎯 **面试答题模板（1 分钟版）**

> **面试官**：你这个项目最难的部分是什么？

**你**（按这个结构答）：  
1. **定位难点**："我觉得最难的是【流式输出的智能滚动】/【多智能体状态同步】（选一个）"  
2. **Why难**："因为要同时满足【性能】和【用户体验】/【一致性】和【实时性】"  
3. **How解决**："我的方案是【事件分层 + 节流批量更新 + 虚拟列表】/【状态机编排 + SSE 分区推送】"  
4. **业内对比**："也考虑过用【React Query】/【AutoGen】，但最终选自研是因为【场景特殊 + 可控性强】"  
5. **效果量化**："最终做到了【千条消息不卡顿 60fps】/【4 个 Agent 辩论 3 轮，前端 0 丢事件】"

---

## 📊 **技术栈亮点速查表（给简历用）**

| 分类 | 技术点 | 关键词（面试高频） |
|------|--------|-------------------|
| **前端框架** | React 18 + TypeScript | Hooks, Reducer, Context |
| **状态管理** | 自研缓存 + 乐观更新 | 幂等对齐, clientMessageId |
| **性能优化** | react-virtuoso 虚拟列表 | 虚拟滚动, 懒加载 |
| **实时通信** | SSE (EventSource) | 流式输出, 断线重连 |
| **工具调用** | 自研 JSON 提取器 + 校验器 | 多策略容错, 防幻觉 |
| **多智能体** | 辩论式编排 + 共识趋势 | 状态机, 相似度计算 |
| **后端架构** | Modern.js BFF + PostgreSQL | RESTful, 分层架构 |
| **代码质量** | ESLint + TypeScript strict | 类型安全, 代码复用 |

---

## 🔄 **SSE 中断完整流程图（记忆辅助）**

```
用户发送消息 "什么是 React Hooks？"
    ↓
后端开始流式推送: "React Hooks 是..."
    ↓ (已推送 50 个 token)
[⚠️ 网络抖动 / Nginx 超时 / 服务重启] ← 中断点
    ↓
┌─────────────────────────────────────────────────┐
│ 后端 (chat.ts)                                  │
│ - safeWrite 捕获 AbortError                     │
│ - 停止推送，不再写入新 token                    │
│ - finally 块：清理心跳定时器 + 释放并发名额     │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ 前端 (ChatInterface.tsx)                        │
│ - EventSource onerror 触发                      │
│ - 保留已推送的 50 个 token（不清空）            │
│ - 显示: "连接中断，正在尝试重连..."             │
│ - 等待 1s（指数退避）后重连                     │
└─────────────────────────────────────────────────┘
    ↓
重连成功 → 后端继续推送 → 前端追加新 token（51, 52, 53...）
    ↓
用户看到的效果: "React Hooks 是...[1s 停顿]...React 16.8 引入的..."
                         ↑ 中断期间，用户只感知到短暂停顿
```

**关键点**：  
- ✅ 已推送的 50 个 token **不丢失**（增量更新模式）  
- ✅ 重连时间 < 2s，用户感知弱  
- ✅ 如果 5 次重试都失败，显示"连接失败，请重试"按钮

---

## 🎫 **队列化机制（MVP 内存版本）- 防惊群效应**

### **背景：为什么需要队列化？**

当并发名额满时，如果所有客户端都得到相同的 `Retry-After`（比如 2 秒），那么 2 秒后大家会**同时重连**，可能再次触发 429，形成**惊群效应（Thundering Herd）**。

**队列化的核心思路**：  
不再让客户端"盲目重试"，而是给每个请求分配一个**队列 token + 队列位置**，并根据位置计算**差异化的等待时间**，天然错峰重连。

---

### **✅ 1. 后端：内存队列管理器**

#### **📍 核心组件（queueManager.ts）**

**队列存储**：
```typescript
const queue: QueueItem[] = [];  // 按入队顺序排列
const tokenMap = new Map<string, QueueItem>();  // token -> QueueItem 快速查找
```

**入队逻辑（enqueue）**：
- 如果客户端带了 token 且 token 还在队列中 → 返回原位置（不重新排队）
- 否则 → 生成新 token，加入队列尾部
- 计算 `Retry-After = ceil(position / rate) + jitter`（rate = 每秒放行 5 个）

**出队逻辑（dequeue）**：
- 成功获得并发名额时，从队列中移除 token
- 自动清理过期 token（3 分钟 TTL）

**jitter 防同秒重试**：
```typescript
function addJitter(baseMs: number): number {
  const jitter = Math.floor(Math.random() * (1000 - 300 + 1)) + 300;  // 300~1000ms
  return baseMs + jitter;
}
```

---

#### **📍 sseLimiter 改造**

**新增参数**：
```typescript
export function acquireSSESlot(userId: string, queueToken?: string): AcquireResult
```

**核心逻辑**：
```typescript
if (activeGlobal >= maxGlobal) {
  const queueInfo = enqueue(userId, queueToken);  // 加入队列
  return {
    ok: false,
    queueToken: queueInfo.token,
    queuePosition: queueInfo.position,
    retryAfterSec: queueInfo.retryAfterSec,  // 含 jitter
    estimatedWaitSec: queueInfo.estimatedWaitSec,
    // ...
  };
}
// 有空位，发放名额 + 出队
dequeue(queueToken);
return { ok: true, release, ... };
```

---

#### **📍 HTTP 429 返回格式**

**Header 新增**：
```
Retry-After: 3
X-Queue-Token: q_1234567890_abc123
X-Queue-Position: 8
X-Queue-Estimated-Wait: 2
```

**Body**（保持不变）：
```json
{ "success": false, "error": "服务端繁忙：当前流式连接过多，已加入队列" }
```

---

### **✅ 2. 前端：读取 Token 并回传**

#### **📍 核心改动（ChatInterface.tsx）**

**1. 添加 queueToken ref**：
```typescript
const queueTokenRef = useRef<string | null>(null);
```

**2. 请求体携带 token**：
```typescript
const requestBody = {
  // ...
  queueToken: queueTokenRef.current || undefined,
};
```

**3. 429 响应处理 - 读取队列信息**：
```typescript
if (response.status === 429) {
  const queueToken = response.headers.get('X-Queue-Token');
  const queuePosition = response.headers.get('X-Queue-Position');
  const estimatedWait = response.headers.get('X-Queue-Estimated-Wait');
  
  // 保存 token，下次重试时携带
  if (queueToken) {
    queueTokenRef.current = queueToken;
  }
  
  // 显示队列信息给用户
  if (queuePosition) {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === assistantMessageId
          ? { ...msg, thinking: `排队中，您前面还有 ${queuePosition} 个请求，预计等待 ${estimatedWait} 秒...` }
          : msg
      )
    );
  }
  
  return { completed: false, retryAfterMs: ... };
}
```

**4. 成功后清除 token**：
```typescript
// 流式处理成功完成
if (queueTokenRef.current) {
  queueTokenRef.current = null;  // 避免下次请求带旧 token
}
```

---

### **✅ 3. 工作流程（完整闭环）**

```
【第 1 次请求】
用户 A 发送消息 → 并发满 → 后端返回 429：
  - Token: q_123
  - Position: 8
  - Retry-After: 2s (含 jitter)
→ 前端保存 token，显示"排队中，您前面还有 8 个请求"

【第 2 次重试（2 秒后）】
前端携带 token: q_123 → 后端：
  - 识别 token，位置可能变成 3（前面 5 个已处理）
  - 返回新的 Retry-After: 1s
→ 前端更新提示："排队中，您前面还有 3 个请求"

【第 3 次重试（1 秒后）】
前端携带 token: q_123 → 后端：
  - 有空位！发放名额 → 从队列移除 token
  - 返回 200，进入 SSE 流式推送
→ 前端清除 token，正常接收回答
```

---

### **✅ 4. 优势与局限**

#### **优势**
- **防惊群**：不同位置的用户等待时间不同（jitter 叠加位置差异）
- **公平性**：先来先服务（token 保证位置不变）
- **用户体验**：显示队列位置和预估等待时间，减少焦虑
- **实现简单**：MVP 版本纯内存，无需引入 Redis

#### **局限（MVP 版本）**
- **单进程**：重启会丢失队列
- **不跨实例**：多实例部署时每个实例有独立队列
- **无持久化**：进程崩溃队列丢失

#### **生产升级方案**
- 用 **Redis ZSET** 存储队列（score = 入队时间，member = token）
- 用 **Redis HASH** 存储 token 元数据（userId, createdAt, expireAt）
- 用 **Lua 脚本** 保证出队/入队的原子性
- 支持用户取消（`/api/queue/cancel` 端点）

---

### **✅ 5. 面试如何讲（30 秒版本）**

"我们的并发控制从'429 + 固定 Retry-After'升级到了**队列化机制**。当并发满时，服务端把请求加入队列，返回 `X-Queue-Token` 和队列位置，并根据 `position / rate + jitter` 计算差异化的等待时间，避免惊群。前端携带 token 重试，保证先来先服务。MVP 用内存实现，生产环境会迁移到 Redis + Lua 原子化处理。这样既保证了公平性，又提升了系统稳定性。"

---

## 💾 **消息持久化策略（重要补充）**

### **核心问题：中断的回答会存入数据库吗？**

**答案**：✅ **会**！参考 ChatGPT 设计，即使中断，已生成的内容也会保存（在 finally 块里）。

### **持久化时机**

#### **1. 用户消息：立即保存（流式开始前）**
```typescript
// 在流式推送开始之前就保存了
await MessageService.addMessage(conversationId, userId, 'user', message, ...);
```

#### **2. AI 回答：两个保存时机**

**正常完成（主路径）**：
```typescript
// 在工具调用循环完成后、发送 [DONE] 之前
if (accumulatedText) {
  await MessageService.addMessage(conversationId, userId, 'assistant', accumulatedText, ...);
  messageSaved = true;  // ✅ 标记已保存
}
await safeWrite('data: [DONE]\n\n');
```

**中断场景（finally 块兜底）**：
```typescript
} finally {
  // ✅ 保存不完整的回答（参考 ChatGPT 设计）
  if (!messageSaved && accumulatedText && accumulatedText.trim()) {
    await MessageService.addMessage(conversationId, userId, 'assistant', accumulatedText, ...);
    console.log('✅ [Finally] 不完整的回答已保存到数据库');
  }
}
```

**设计亮点**：
- 用 `messageSaved` 标志避免重复保存
- 参考 ChatGPT：即使中断，已生成的内容也有价值，应该保存
- 用户刷新后能看到"部分回答"，比"问了但没答"体验好

### **重连场景的真相**

**重要理解**：重连是**发起新请求**（重新生成），不是"续传"！

```
原请求: "React Hooks 是..." (推送 100 token) → 中断 → 不保存
新请求: "React Hooks 是..." (从头推送 500 token) → 完整结束 → 保存完整内容
```

**前端 UI 层面**：
- 用"增量更新"让用户感觉是"续传"
- 实际后端是重新生成完整回答

### **潜在问题与优化**

**问题 1：中断后用户消息"没有回复"**
- ~~现状：数据库只有用户消息，没有 AI 回答~~
- ✅ **已优化**：在 finally 块保存不完整的回答（参考 ChatGPT 设计）

**问题 2：重连浪费 token**
- 现状：中断前的 100 token 白推了，重连会重新推 500 token
- 优化：支持"断点续传"（Redis 缓存 accumulatedText + resumeFromToken 参数）

### **面试速答**
> **面试官**：中断的回答会存入数据库吗？什么时候存？  
> **你**：**会**！有两个保存时机：  
> 1. 主路径：流式完全结束后保存（在发送 `[DONE]` 之前）  
> 2. 兜底路径：`finally` 块检查 `!messageSaved && accumulatedText`，保存不完整的回答  
> 
> 这样设计参考了 ChatGPT：即使中断，已生成的内容也有价值。用户刷新后能看到"部分回答"，比"问了但没答"体验好。用 `messageSaved` 标志避免重复保存。

---

## 🗄️ **localStorage vs sessionStorage 选择（常见追问）**

### **核心问题：为什么用 localStorage 而不是 sessionStorage？**

**答案**：业务需求决定——需要**跨会话持久化**和**跨标签页共享**。

### **两个使用场景**

#### **1. 用户 ID 持久化**
```typescript
// userManager.ts
export function getUserId(): string {
  let userId = localStorage.getItem('ai_agent_user_id');
  if (!userId) {
    userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('ai_agent_user_id', userId);
  }
  return userId;
}
```

**为什么用 localStorage？**
- ✅ 需要跨会话持久化：用户关闭浏览器后再打开，仍然是同一个用户
- ✅ 模拟"登录状态"：没有真正的用户系统，用本地生成的 userId 作为身份标识
- ❌ 如果用 sessionStorage：每次打开都是新用户，历史对话全丢失

#### **2. 消息缓存**
```typescript
// conversationCache.ts
// 目标：
// 1. 切换对话时"秒开"：先从本地缓存渲染
// 2. 支持"待同步消息"：刷新时也能看到刚发的消息
// 3. 跨标签页共享：多个标签打开同一个会话时数据同步
```

**为什么用 localStorage？**
- ✅ 刷新页面不丢数据：F5 刷新后消息列表立即恢复
- ✅ 跨标签页共享：用户在多个标签页打开聊天，消息保持同步
- ❌ 如果用 sessionStorage：多标签页数据不同步，用户困惑

### **对比表**

| 维度 | localStorage | sessionStorage | 我们的选择 |
|------|--------------|----------------|-----------|
| **生命周期** | 永久（除非手动删除） | 标签页关闭即清除 | ✅ localStorage |
| **跨标签页** | 同源下所有标签页共享 | 每个标签页独立 | ✅ localStorage |
| **典型场景** | 用户偏好、身份、缓存 | 表单草稿、临时状态 | - |

### **容错设计（亮点）**

**问题**：localStorage 满了（5-10MB）会抛异常

**解决**：
```typescript
try {
  localStorage.setItem(key, JSON.stringify(data));
} catch (e) {
  // localStorage 满了：裁剪到最近 200 条消息
  const minimal = trimMessages(messages, 200, 10);
  try {
    localStorage.setItem(key, JSON.stringify(minimal));
  } catch {
    // 放弃缓存，不影响核心功能
  }
}
```

### **面试速答**
> **面试官**：为什么用 localStorage 而不是 sessionStorage？  
> **你**：因为用户 ID 和消息缓存都需要**跨会话持久化**和**跨标签页共享**。如果用 sessionStorage，用户关闭标签后再打开会变成新用户，历史对话全丢失。同时我做了容错（localStorage 满了降级）和版本兼容（支持旧格式迁移）。

---

## 🚀 **加分项（如果面试官追问）**

1. **"你为什么不用 ChatGPT 那样的 Markdown 代码高亮？"**  
   → 我用了 `react-markdown` + `react-syntax-highlighter`，支持 120+ 语言高亮

2. **"SSE 断线了怎么办？"**  
   → `EventSource` 自动重连，我加了 `AbortController` 手动控制，避免用户切换会话时残留旧连接

3. **"如果消息太多，搜索怎么办？"**  
   → 计划做"向量检索"（已预留 `embedding` 字段），用 pgvector 做语义搜索

4. **"为什么不用 Redux？"**  
   → 聊天应用状态都是"会话级"的，不需要跨组件共享，Context + Hooks 足够了

5. **"如果要做离线支持呢？"**  
   → 用 IndexedDB 存本地消息，用 Service Worker 拦截请求，类似 PWA

---

## ✅ **总结：面试官最想听到的**

1. **能讲清楚 why 难**（不是"我做了什么"，而是"为什么这样做"）
2. **有业内对比**（证明你调研过、有技术视野）
3. **有量化指标**（性能提升多少、代码减少多少）
4. **有 trade-off 思考**（为什么不用 XXX 方案）

祝面试顺利！🎉

