# P1 降低复杂度：拆分 chat.ts + 合并流处理器

## 一、问题背景

P0 收敛了重复实现和架构旁路。P1 聚焦于降低核心模块的复杂度：

1. **`chat.ts` 的 `post()` 函数有 ~400 行**，包含 6 条不同的执行路径（上传组装、续流、缓存、Chunking、多 Agent、单 Agent），每次新增模式都要在这个巨函数里找位置插入分支。
2. **`singleAgentHandler.ts` 的 `handleVolcanoStream` 和 `handleLocalStream` 高度重复**（~650 行），两者的 SSE 骨架、工具调用循环、消息保存、metrics 上报逻辑几乎完全一致，唯一区别是流解析格式——而这已经被 `StreamParser` 抽象过了。

### 量化重复度

`handleVolcanoStream` vs `handleLocalStream` 的同构代码：

| 步骤 | Volcano (行) | Local (行) | 差异 |
|------|-------------|-----------|------|
| TransformStream + SSE Writer 初始化 | 61-89 | 402-425 | 仅 controlledWriter 工厂不同 |
| 工具调用累积 → 执行 → 重调模型 | 144-263 | 482-541 | 累积方式不同（SSE delta vs parser batch） |
| 消息保存 + metrics | 286-331 | 556-594 | 几乎一致 |
| 异步包裹 + init/heartbeat/cleanup | 340-385 | 607-664 | 完全一致 |

---

## 二、方案设计

### P1-1: 拆分 chat.ts — 策略模式提取

将 `post()` 中的 6 条执行路径提取为独立的处理函数，放到 `api/handlers/chat-strategies/` 目录。`chat.ts` 只保留参数校验、身份解析、并发控制、策略分发。

**提取清单：**

| 策略 | 源码行范围 | 提取到 |
|------|-----------|--------|
| 上传会话组装 | 133-163 | `resolveUploadMessage()` in `chat-strategies/upload.ts` |
| Chunking 超长文本 | 274-346 | `handleChunkingMode()` in `chat-strategies/chunking.ts` |
| 多 Agent 模式 | 348-373 | `handleMultiAgent()` in `chat-strategies/multi-agent.ts` |
| 单 Agent 模式 | 375-482 | `handleSingleAgent()` in `chat-strategies/single-agent.ts` |

续流和缓存检查保留在 `chat.ts`（逻辑简单且是前置短路）。

### P1-2: 合并流处理器 — 统一 SSE 处理骨架

创建 `handleAgentStream()` 统一函数，通过 `StreamAdapter` 接口抽象流解析差异：

```typescript
interface StreamAdapter {
  parseLine(line: string): ParsedChunk | null;
  getAccumulatedContent(): string;
  getAccumulatedThinking(): string;
  getRawAccumulatedContent(): string;
  reset(): void;
}
```

- **OpenAI/火山引擎**：内联 adapter，解析 `data: {...}` 格式的 SSE 行
- **Ollama**：直接复用已有的 `OllamaStreamParser` 作为 adapter

合并后 `singleAgentHandler.ts` 从 ~665 行降至 ~350 行。

---

## 三、实现计划

### Step 1: 提取 chat.ts 的策略模块

新增文件：
- `api/handlers/chat-strategies/upload.ts` — 上传会话解压组装
- `api/handlers/chat-strategies/chunking.ts` — 超长文本分段处理
- `api/handlers/chat-strategies/multi-agent.ts` — 多 Agent 鉴权 + 分发
- `api/handlers/chat-strategies/single-agent.ts` — 单 Agent 模型路由

改动文件：
- `api/lambda/chat.ts` — 瘦身为策略分发器

### Step 2: 合并 handleVolcanoStream + handleLocalStream

新增文件：
- `api/handlers/stream-adapter.ts` — `StreamAdapter` 接口 + OpenAI adapter 实现

改动文件：
- `api/handlers/singleAgentHandler.ts` — 合并为统一的 `handleAgentStream()`

---

## 四、效果验证

- [ ] `chat.ts` 的 `post()` 函数降至 ~120 行（参数校验 + 策略分发）
- [ ] `singleAgentHandler.ts` 不再有两个几乎一样的函数
- [ ] 所有现有功能正常工作（单 Agent、多 Agent、Chunking、续流、缓存命中）
- [ ] 无 lint 错误
