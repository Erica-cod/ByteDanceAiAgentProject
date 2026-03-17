# Ollama 多模型流式格式兼容方案

## 一、问题背景

项目实现了模块化 LLM Provider 架构后，切换本地模型只需改一行 `OLLAMA_MODEL` 环境变量。但实际测试发现，**不同 Ollama 模型的流式输出格式存在显著差异**，导致切换模型后前端行为异常（如一直显示"正在思考..."、工具调用不触发等）。

### 1.1 三个本地模型的实际输出差异

通过 `curl` 直接请求 Ollama `/api/chat` 接口，逐个模型抓取原始 JSON 行输出，发现了三种不同的行为模式：

| 模型 | thinking 方式 | tool_calls 位置 | 特殊行为 |
|------|-------------|----------------|---------|
| **qwen3:8b** | `message.thinking` 独立字段 | `done:false` 消息中 | 带 tools 时需 `think:false` 否则只输出 thinking |
| **deepseek-r1:7b/1.5b** | `<think>` 标签嵌在 `message.content` | 不支持 tools | 无 |
| **llama/mistral 等** | 无 thinking | `done:true` 消息中 | 传统行为 |

### 1.2 为什么不能硬编码

最初的 handler（`singleAgentHandler.ts`）将 JSON 解析逻辑全部内联：

- 硬编码读 `message.thinking` 字段
- 硬编码用 `<think>` 正则提取
- 只在 `done:true` 时检查 tool_calls

每换一个模型就要改 handler 代码，违反了"一行配置切换模型"的初衷。

## 二、设计思路

### 2.1 核心原则

**让格式差异变成配置，而非代码分支。**

项目中已有 `StreamParser` 接口和 `ParsedChunk` 类型，但 handler 完全没用它们。方案的核心不是发明新抽象，而是**让已有的抽象层真正生效**。

### 2.2 关键决策

1. **为什么不用策略模式（每个模型一个 Parser 子类）？**
   - Ollama 模型的差异很有限——就是 thinking 的输出方式和 tool_calls 出现的位置。用配置参数区分足够了，不值得为每个模型写一个类。

2. **为什么 thinkingField / thinkingTag 也要可配置？**
   - 最初只做了 `thinkingMode: 'field' | 'tags' | 'none'` 三种模式，但字段名 `message.thinking` 和标签名 `<think>` 是硬编码的。如果将来某个模型用 `message.reasoning` 或 `<Imaging>` 标签，又要改代码。把"变量"也暴露为配置项，彻底消除硬编码。

3. **为什么所有模型都显式写全配置而不用默认值？**
   - 默认值虽然能减少代码量，但降低了可读性。当你看到一个模型条目缺少 `thinkingMode` 时，需要去翻 TypeScript 类型定义才知道默认是 `'none'`。显式写出来，每个模型条目自解释。

## 三、数据流

### 3.1 改造前

```
Ollama /api/chat  ──JSON行──▶  handler (内联解析)  ──SSE──▶  前端
                                  ↑
                          硬编码：message.thinking / <think> / done=true 时检查 tool_calls
```

handler 既负责业务逻辑（工具调用、消息保存、SSE 推送），又负责 JSON 格式解析。换模型就要改 handler。

### 3.2 改造后

```
┌─────────────────────┐
│   ModelConfig        │  ← model-catalog.ts 中配置
│  thinkingMode        │
│  thinkingField       │
│  thinkingTag         │
│  toolCallsInStream   │
└────────┬────────────┘
         │ 配置注入
         ▼
┌─────────────────────┐       ┌─────────────────────┐
│  OllamaProvider      │──────▶│  OllamaStreamParser  │
│  存储格式配置         │ 创建   │  根据配置解析 JSON    │
│  控制请求参数         │       │  输出统一 ParsedChunk │
│  (如 think:false)    │       └────────┬────────────┘
└─────────────────────┘                │ ParsedChunk
                                       ▼
                               ┌─────────────────────┐
                               │  Handler             │
                               │  只消费 ParsedChunk   │
                               │  不关心 JSON 格式     │
                               └────────┬────────────┘
                                        │ SSE events
                                        ▼
                                    前端
```

**Parser 是唯一知道 JSON 格式细节的地方。** Handler 只看 `ParsedChunk` 的 `content`、`thinking`、`completeToolCalls`、`done` 字段。

## 四、改动清单

### 4.1 类型扩展 — `providers/types.ts`

`ModelConfig` 新增 4 个可选字段：

```typescript
thinkingMode?: 'field' | 'tags' | 'none';
thinkingField?: string;   // field 模式下的字段名，如 'thinking'
thinkingTag?: string;      // tags 模式下的标签名，如 'think'
toolCallsInStream?: boolean;
```

`ParsedChunk` 新增：

```typescript
thinking?: string;  // thinking 增量/累积内容
```

### 4.2 模型目录 — `model-catalog.ts`

每个模型条目显式标注全部格式配置。文件顶部有完整的字段说明注释。

### 4.3 流解析器 — `ollama-stream-parser.ts`

完全重写。构造函数接收 `OllamaParserConfig`：

```typescript
interface OllamaParserConfig {
  thinkingMode: ThinkingMode;
  thinkingField: string;   // 默认 'thinking'
  thinkingTag: string;     // 默认 'think'
  toolCallsInStream: boolean;
}
```

`parseLine()` 的行为完全由配置驱动：

- **field 模式**：读取 `data.message[config.thinkingField]`（不是硬编码 `data.message.thinking`）
- **tags 模式**：调用 `extractThinkingAndContent(text, config.thinkingTag)`（不是硬编码 `<think>`）
- **none 模式**：只处理 `message.content`
- **tool_calls**：在所有消息中检测并累积，`done` 时一次性返回

Parser 内部维护 `accumulatedContent` / `accumulatedThinking` / `pendingToolCalls` 状态，通过 getter 方法暴露给 handler 用于消息保存。

### 4.4 内容提取器 — `content-extractor.ts`

`extractThinkingAndContent` 新增第二个参数 `tagName`（默认 `'think'`），正则表达式动态构建，不再硬编码 `<think>` / `</think>`。

### 4.5 Provider — `ollama-provider.ts`

- 存储 `thinkingMode` / `thinkingField` / `thinkingTag` / `toolCallsInStream`
- `think: false` 逻辑改为基于 `thinkingMode === 'field'` 判断，而非无条件设置
- 暴露 getter 方法供 Registry 读取

### 4.6 注册表 — `registry.ts`

`getStreamParser()` 从 OllamaProvider 获取全部格式配置，传给 `OllamaStreamParser` 构造函数。

### 4.7 Handler — `singleAgentHandler.ts`

`handleLocalStream` 重构：

- 通过 Registry 获取 StreamParser 实例
- `processOllamaStream` 内部用 `parser.parseLine(line)` 替代所有内联 JSON 解析
- 从 `ParsedChunk` 读取 `content` / `thinking` / `completeToolCalls` / `done`
- 移除 `accumulatedText` / `accumulatedThinking` / `pendingToolCalls` / `extractThinkingAndContent` 等内联状态和调用——这些职责全部转移到 Parser 内部

## 五、改造结果

### 5.1 新增模型的操作步骤

**只需两步，零代码修改：**

1. `.env.local` 改 `OLLAMA_MODEL=xxx`
2. `model-catalog.ts` 加一条配置

示例——假设某模型用 `message.reasoning` 字段和 `<Imaging>` 标签：

```typescript
'future-model:7b': {
  provider: 'ollama',
  modelName: 'future-model:7b',
  supportsTools: true,
  thinkingMode: 'field',        // 独立字段模式
  thinkingField: 'reasoning',   // 字段名是 reasoning 不是 thinking
  toolCallsInStream: false,
  vramGB: 4.5,
  description: '...',
},

'another-model:13b': {
  provider: 'ollama',
  modelName: 'another-model:13b',
  supportsTools: false,
  thinkingMode: 'tags',         // XML 标签模式
  thinkingTag: 'Imaging',       // 标签是 <Imaging>...</Imaging> 不是 <think>
  toolCallsInStream: false,
  vramGB: 8.0,
  description: '...',
},
```

### 5.2 兼容性验证

三个本地模型全部通过测试：

| 模型 | thinkingMode | 推断结果 | 状态 |
|------|-------------|---------|------|
| qwen3:8b | `field` (thinking) | message.thinking ✓ | ✅ |
| deepseek-r1:7b | `tags` (think) | `<think>` 标签 ✓ | ✅ |
| deepseek-r1:1.5b | `tags` (think) | `<think>` 标签 ✓ | ✅ |

### 5.3 涉及的文件

| 文件路径 | 改动类型 |
|---------|---------|
| `api/_clean/infrastructure/llm/providers/types.ts` | 类型扩展 |
| `api/_clean/infrastructure/llm/model-catalog.ts` | 配置补全 + 注释 |
| `api/_clean/infrastructure/llm/stream-parsers/ollama-stream-parser.ts` | 完全重写 |
| `api/_clean/shared/utils/content-extractor.ts` | 参数化标签名 |
| `api/_clean/infrastructure/llm/providers/ollama-provider.ts` | 存储/暴露配置 |
| `api/_clean/infrastructure/llm/providers/registry.ts` | 透传配置 |
| `api/handlers/singleAgentHandler.ts` | 移除内联解析，委托给 Parser |
