# 多Agent流式JSON渐进渲染：技术决策记录

> **问题**：多Agent讨论中，Planner/Critic输出的JSON被逐字流式推送到前端，用户看到的是 `{"position":{"conclusion":"...` 这样的原始文本，观感像乱码。  
> **约束**：5轮讨论约5分钟，需要让用户看到每轮进展，不能等全部完成再展示。  
> **本文档记录了从方案提出到最终落地的完整决策链路，包括被否决的方案及其原因。**

---

## 决策链路总览

```
方案1：服务端缓冲+格式化推送
    ↓ 用户指出：200并发 × 5分钟 = 服务器内存炸裂
方案2：搜索业界实践 → 客户端解析
    ↓ 用户指出：项目已有 jsonrepair，无需引入 partial-json
方案3：useMemo + 按增量渲染
    ↓ 用户指出：useMemo 对流式内容无缓存意义；增量渲染体验不一致
方案4（最终）：直接调用 jsonrepair + 全量实时渲染
```

---

## 方案1：服务端缓冲 + 格式化后推送（❌ 否决）

### 思路

在 `multiAgentOrchestrator.ts` 的 `generateWithStreaming` 中区分 agent 类型：

- **Reporter**（输出纯Markdown）：照常透传 chunk
- **Planner/Critic**（输出JSON）：后端缓冲所有 chunk，等 `agent.generate()` 完成后，将格式化好的 Markdown 以小 chunk（40字/12ms）渐进推送给前端

```typescript
// ❌ 被否决的代码
const shouldStreamDirectly = (agentId === 'reporter');

agent.callModel = async (messages, onChunk?) => {
  return await originalCallModel(messages, async (chunk) => {
    // 仅 reporter 透传；planner/critic 的 chunk 被丢弃（后端缓冲）
    if (shouldStreamDirectly && this.callbacks.onAgentChunk) {
      await this.callbacks.onAgentChunk(agentId, round, chunk);
    }
  });
};

// 生成完成后，planner/critic 由后端分块推送格式化内容
if (!shouldStreamDirectly && output.content) {
  await this.streamFormattedContent(agentId, round, output.content);
}
```

### 否决原因

用户立刻指出核心风险：

> "如果多用户（比如初步估计规模200人）同时多agent讨论，你全部暂存后端，你看看之前我记得还做过后端还要暂存用户断线重连的数据。为了一个用户显示友好又要引入服务器风险问题。"

**量化分析**：
- 单用户单次多Agent会话：LLM 输出约 5-10KB/agent × 4 agent × 5 轮 = ~200KB
- 200并发用户：200 × 200KB = ~40MB 内存（仅缓冲区，不含连接、会话状态）
- 叠加已有的断线重连 MongoDB 持久化数据、SSE 连接保持
- 如果 LLM 响应慢导致缓冲堆积，内存占用会进一步膨胀

**结论**：纯展示层问题不应引入服务端状态，这是客户端的职责。

---

## 方案2：搜索业界实践 → 客户端解析（✅ 方向确认）

### 调研结果

搜索 GitHub、技术论坛后，找到两个业界主流方案：

| 方案 | 代表项目 | 原理 | 适用场景 |
|------|----------|------|----------|
| **Vercel AI SDK `useObject`** | vercel/ai | 客户端用 Zod schema 做增量解析，`partial-json` 修复截断 JSON | 服务端定义 schema 的场景 |
| **partial-json** | npm partial-json | 纯客户端解析不完整 JSON，自动闭合括号 | 通用流式 JSON |

**共同点**：都在客户端解析，服务端只负责透传原始 chunk。

### 用户反馈：复用已有依赖

> "这个项目还用了 jsonrepair 来修复模型有时候产生的 json 错误格式问题，那和你说的 partial-json 有什么区别？我能用 jsonrepair 来做吗？"

**对比分析**：

| 维度 | jsonrepair | partial-json |
|------|-----------|-------------|
| 功能范围 | 修复各类 JSON 语法错误（缺逗号、多余逗号、截断等） | 仅处理截断（自动闭合括号） |
| 截断修复 | ✅ 支持（是其功能子集） | ✅ 专门为此设计 |
| 包体积 | ~13KB | ~3KB |
| 项目现状 | **已在 `api/_clean/shared/utils/json-extractor.ts` 中使用** | 需新增依赖 |

**结论**：`jsonrepair` 功能是 `partial-json` 的超集，且已在项目中，无需引入新依赖。前端直接 `import { jsonrepair } from 'jsonrepair'` 即可（纯 JS 包，可在浏览器运行）。

---

## 方案3：useMemo + 按增量渲染（❌ 否决）

### 思路

用 `useMemo` 缓存解析结果，避免每次渲染都重新解析；同时为了减少 `jsonrepair` 调用频率，采用增量渲染——仅在内容增量达到一定阈值时才重新解析。

```typescript
// ❌ 被否决的代码
const parsed = useMemo(() => {
  return tryParseStreamingJSON(streamContent);
}, [streamContent]);
```

### 否决原因：两个问题

**问题1：useMemo 在此场景无意义**

用户指出：

> "那你之前不是说用 useMemo 没用吗，为什么你老想着用这个钩子？"

`streamContent` 是流式累积字符串，每次 RAF 批处理后都会变化。`useMemo` 的依赖项 `[streamContent]` 每帧都变，导致每帧都重新执行 `tryParseStreamingJSON`——与不用 `useMemo` 直接调用完全一样，但多了 React 的依赖比较开销。

```
useMemo 的价值 = 缓存命中率 × 计算开销
                = 0% × 0.4ms
                = 0
额外开销 = 每帧依赖比较 ≈ 0.01ms
净收益 = -0.01ms（负值）
```

**问题2：增量渲染体验不一致**

用户指出，项目里正常聊天（单Agent）已经是逐帧实时渲染的：
- `StreamingMarkdown` + `markdownFixer` + `requestAnimationFrame` 批处理
- React 18 自动合并渲染

如果多Agent场景改为"积攒一批再渲染"，用户会感到和正常聊天不一致——卡顿感。

### jsonrepair 性能不是瓶颈

从原理分析：
- `jsonrepair` 核心是单次扫描 + 状态机修复，时间复杂度 O(n)
- 典型 Planner 输出 ~2000字 JSON → 解析耗时 ~0.2ms
- 现有渲染管线中 `react-markdown` + `remark-gfm` + `rehype-highlight` 的单帧开销 >> 1ms
- `jsonrepair` 的 0.2ms 在整个管线中可忽略

---

## 方案4（最终）：直接调用 jsonrepair + 全量实时渲染（✅ 采用）

### 核心原则

1. **后端零改动**：所有 agent 的 chunk 原样透传，不区分 agent 类型
2. **客户端纯函数解析**：不用 hook，不用缓存，直接在渲染路径中调用
3. **与现有渲染管线一致**：复用 `StreamingMarkdown`，保持逐帧渲染体验

### 架构

```
LLM 流式输出 JSON chunk
    ↓ 后端原样透传（SSE，所有 agent 统一处理）
    ↓ 前端 useRAFBatching 逐帧累积到 streamContent
    ↓ MultiAgentDisplay 渲染时：
    │
    ├─ tryParseStreamingJSON(streamContent)
    │   ├─ 提取 JSON（剥离 ```json 代码块标记）
    │   ├─ 先尝试 JSON.parse（成功则跳过 repair）
    │   └─ 失败则 jsonrepair() → JSON.parse
    │
    ├─ 解析成功 → formatPartialAgentData(parsed)
    │   └─ 生成与后端 formatPlanContent/formatCritiqueContent 格式一致的 Markdown
    │   └─ 传入 StreamingMarkdown 渲染
    │
    └─ 解析失败（chunk 太短 / reporter 的 Markdown）
        └─ 降级到原有路径（StreamingMarkdown 直接渲染）
```

### 用户体验时间线

```
t=0s      agent_start → 打字指示器 + "正在制定规划方案..."
t=0.5s    累积约200字 JSON → jsonrepair 首次解析成功
          → 卡片显示：结论文本
t=1.0s    累积约500字 → 卡片追加：关键理由列表
t=2.0s    累积约1000字 → 卡片追加：详细计划阶段
...
t=30s     agent_complete → isStreaming=false
          → effectiveContent 切换到 output.content（后端格式化的完整 Markdown）
          → 视觉无跳变（格式一致）
```

### 变更文件

| 文件 | 改动 |
|------|------|
| `api/workflows/multiAgentOrchestrator.ts` | 撤回方案1的条件缓冲，恢复所有 chunk 透传 |
| `src/utils/json/streamingJsonParser.ts` | **新建**。`tryParseStreamingJSON` + `formatPartialAgentData` |
| `src/components/business/Message/MultiAgentDisplay.tsx` | 导入 utility，流式阶段增加 JSON 解析分支 |

### 关键代码

**streamingJsonParser.ts**（核心解析）：

```typescript
export function tryParseStreamingJSON<T = any>(raw: string | undefined): T | null {
  if (!raw) return null;
  const jsonStr = extractJSONFromStream(raw);  // 剥离 ```json 标记，提取 JSON 部分
  if (!jsonStr || jsonStr.length < 10) return null;

  try {
    return JSON.parse(jsonStr);           // 优先原生解析（已完整时零开销）
  } catch {
    try {
      return JSON.parse(jsonrepair(jsonStr)); // 截断时用 jsonrepair 修复
    } catch {
      return null;                        // 实在无法修复，返回 null → 降级到占位符
    }
  }
}
```

**MultiAgentDisplay.tsx**（渲染分支）：

```tsx
// 流式阶段：将 LLM 原始 JSON 解析为结构化 Markdown
let effectiveContent = displayContent;
if (isStreaming && displayContent) {
  const parsed = tryParseStreamingJSON(displayContent);
  const formatted = parsed ? formatPartialAgentData(parsed) : null;
  if (formatted) {
    effectiveContent = formatted;
  }
}

// 统一走 StreamingMarkdown，与正常聊天体验一致
<StreamingMarkdown content={effectiveContent} />
```

### 性能预算

| 操作 | 单帧耗时 | 说明 |
|------|----------|------|
| `extractJSONFromStream` | ~0.01ms | 字符串 indexOf + substring |
| `jsonrepair` | ~0.2ms | 单次扫描状态机，2000字 JSON |
| `formatPartialAgentData` | ~0.05ms | 遍历 parsed 对象拼接字符串 |
| **小计** | **~0.26ms** | |
| `react-markdown` + plugins | ~2-5ms | 现有管线中的大头 |
| **总计** | **~2.5-5.3ms** | 远低于 16.67ms（60fps）帧预算 |

---

## 决策总结

| 维度 | 方案1（服务端缓冲） | 方案3（useMemo+增量） | 方案4（最终） |
|------|---------------------|----------------------|---------------|
| 服务端影响 | ❌ 200并发内存风险 | ✅ 无 | ✅ 无 |
| 新依赖 | 无 | 无 | 无（复用 jsonrepair） |
| React hook 开销 | N/A | ❌ useMemo 无缓存收益 | ✅ 无 hook |
| 用户体验一致性 | ⚠️ 缓冲期无反馈 | ❌ 增量渲染有卡顿感 | ✅ 与正常聊天一致 |
| 实现复杂度 | 高（后端改动多） | 中 | 低（1个 utility + 3行渲染改动） |

### 设计原则

1. **展示层问题在展示层解决**——不为 UI 优化引入服务端状态
2. **复用已有依赖**——`jsonrepair` 已在项目中，不引入 `partial-json`
3. **不要为了优化而优化**——`useMemo` 在依赖每帧变化时无意义
4. **保持一致性**——多Agent渲染与单Agent聊天使用相同的逐帧管线

---

**文档版本**：v1.0  
**创建日期**：2026-03-16  
**关联文件**：
- `src/utils/json/streamingJsonParser.ts`
- `src/components/business/Message/MultiAgentDisplay.tsx`
- `api/workflows/multiAgentOrchestrator.ts`
- `docs/03-Streaming/STREAMING_MULTI_AGENT_GUIDE.md`（流式基础设施文档）
