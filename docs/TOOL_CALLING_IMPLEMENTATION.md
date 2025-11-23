# 工具调用（Tool Calling）实现总结

## 📋 目录

- [实现原理](#实现原理)
- [Tavily 集成封装](#tavily-集成封装)
- [技术架构](#技术架构)
- [遇到的困难](#遇到的困难)
- [排查思路与解决方案](#排查思路与解决方案)
- [关键代码解析](#关键代码解析)
- [经验总结](#经验总结)

---

## 实现原理

### 核心概念

工具调用（Tool Calling）是让 AI 模型能够主动调用外部工具（如搜索引擎、数据库、API）的机制。

### 完整流程图

#### 准备阶段 + 运行阶段全流程

```
╔══════════════════════════════════════════════════════════════════════════╗
║                           【准备阶段】                                    ║
╚══════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────────┐
│ 1️⃣  环境配置                                                             │
├─────────────────────────────────────────────────────────────────────────┤
│  .env.local / .env.production:                                           │
│    ├─ TAVILY_API_KEY=tvly-xxx           # Tavily 搜索 API Key           │
│    ├─ ARK_API_KEY=xxx                   # 火山引擎 API Key              │
│    ├─ OLLAMA_API_URL=http://localhost   # 本地模型地址                  │
│    └─ MONGODB_URI=mongodb://localhost   # 数据库连接                    │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 2️⃣  初始化工具                                                           │
├─────────────────────────────────────────────────────────────────────────┤
│  api/tools/tavilySearch.ts:                                              │
│    const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY })  │
│                                                                           │
│  提供的功能:                                                             │
│    ├─ searchWeb(query, options)         # 基础搜索                      │
│    ├─ quickSearch(query)                # 快速搜索（3条）               │
│    ├─ deepSearch(query)                 # 深度搜索（10条+AI摘要）       │
│    └─ formatSearchResultsForAI()        # 格式化结果                     │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 3️⃣  配置 System Prompt                                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  api/lambda/chat.ts - SYSTEM_PROMPT:                                     │
│                                                                           │
│  "你可以使用以下工具：                                                   │
│   ### search_web - 联网搜索工具                                          │
│   使用格式：                                                             │
│   <tool_call>{"tool": "search_web", "query": "关键词"}</tool_call>      │
│                                                                           │
│   示例：                                                                 │
│   用户问："今天的新闻？"                                                 │
│   输出：<tool_call>{"tool": "search_web", "query": "今天新闻"}</...>"   │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 4️⃣  启动服务                                                             │
├─────────────────────────────────────────────────────────────────────────┤
│  npm run dev                                                             │
│    ├─ 启动前端 (React)              http://localhost:8080              │
│    ├─ 启动 BFF 后端 (Modern.js)     /api/*                              │
│    ├─ 连接 MongoDB                   mongodb://localhost:27017         │
│    └─ 准备调用 AI 模型              火山引擎 / Ollama                   │
└─────────────────────────────────────────────────────────────────────────┘


╔══════════════════════════════════════════════════════════════════════════╗
║                           【运行阶段】                                    ║
╚══════════════════════════════════════════════════════════════════════════╝

┌──────────────┐
│   用户界面    │  用户输入："今天北京的天气怎么样？"
└──────┬───────┘
       │ HTTP POST /api/chat
       │ { message: "今天北京的天气怎么样?", modelType: "volcano", userId: "xxx" }
       ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 🔹 步骤 1: 后端接收请求                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  api/lambda/chat.ts - post()                                             │
│    ├─ 验证参数                                                           │
│    ├─ 确保用户存在                                                       │
│    ├─ 创建/获取对话 ID                                                   │
│    └─ 保存用户消息到数据库                                               │
└─────────────────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 🔹 步骤 2: 构建消息历史                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  messages = [                                                            │
│    { role: "system", content: SYSTEM_PROMPT },                           │
│    { role: "user", content: "今天北京的天气怎么样？" }                   │
│  ]                                                                       │
└─────────────────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 🔹 步骤 3: 调用 AI 模型 (第一次)                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  if (modelType === 'volcano')                                            │
│    → callVolcengineModel(messages)                                       │
│       → POST https://ark.cn-beijing.volces.com/api/v3/chat/completions  │
│  else if (modelType === 'local')                                         │
│    → callLocalModel(messages)                                            │
│       → POST http://localhost:11434/api/chat                             │
│                                                                           │
│  返回: Stream (流式响应)                                                 │
└─────────────────────────────────────────────────────────────────────────┘
       │
       ↓ 流式输出每个 token
┌─────────────────────────────────────────────────────────────────────────┐
│ 🔹 步骤 4: 流式处理 AI 响应                                              │
├─────────────────────────────────────────────────────────────────────────┤
│  streamToSSEResponse() / streamVolcengineToSSEResponse()                 │
│                                                                           │
│  for await (chunk of stream) {                                           │
│    accumulatedText += chunk                                              │
│    ┌─────────────────────────────────────────┐                          │
│    │ 实时发送给前端 (SSE)                    │                          │
│    │ data: {"content": "...", "thinking": ""}│                          │
│    └─────────────────────────────────────────┘                          │
│  }                                                                       │
│                                                                           │
│  AI 输出内容:                                                            │
│  "<tool_call>{"tool": "search_web", "query": "今天北京天气预报"}</...>"│
└─────────────────────────────────────────────────────────────────────────┘
       │
       ↓ 流结束，检测 [DONE]
┌─────────────────────────────────────────────────────────────────────────┐
│ 🔹 步骤 5: 检测工具调用                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  if (jsonData.done) {                                                    │
│    const toolCallResult = extractToolCall(accumulatedText)               │
│                                                                           │
│    📝 完整响应: "<tool_call>{"tool": "search_web", ...}</tool_call>"   │
│    🔧 检测到工具调用: { tool: "search_web", query: "今天北京天气预报" } │
│  }                                                                       │
│                                                                           │
│  extractToolCall() 支持三种格式:                                         │
│    ├─ <tool_call>{"tool": "search_web", ...}</tool_call>  (XML标签)    │
│    ├─ <tool_call>{"tool": "search_web", ...}              (开放标签)    │
│    └─ {"tool": "search_web", "query": "..."}              (纯JSON) ✨   │
└─────────────────────────────────────────────────────────────────────────┘
       │
       ↓ if (toolCallResult) → 执行工具
┌─────────────────────────────────────────────────────────────────────────┐
│ 🔹 步骤 6: 执行搜索工具                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  executeToolCall(toolCall)                                               │
│    ↓                                                                     │
│  searchWeb("今天北京天气预报", {                                         │
│    maxResults: 10,                                                       │
│    searchDepth: 'advanced',                                              │
│    includeAnswer: true                                                   │
│  })                                                                      │
│    ↓                                                                     │
│  📡 调用 Tavily API                                                      │
│  POST https://api.tavily.com/search                                      │
│    ↓                                                                     │
│  ✅ 搜索完成，找到 10 条结果                                             │
│    ↓                                                                     │
│  formatSearchResultsForAI(results)  # 格式化为 AI 友好格式               │
│    ↓                                                                     │
│  返回:                                                                   │
│  "<search_results>                                                       │
│   AI 摘要：今天北京天气晴朗，温度 15-25°C...                             │
│                                                                           │
│   搜索结果：                                                             │
│   1. 北京天气预报                                                        │
│      来源：https://weather.com/...                                       │
│      内容：今天北京多云转晴...                                           │
│   2. ...                                                                 │
│   </search_results>"                                                     │
└─────────────────────────────────────────────────────────────────────────┘
       │
       ↓ 将搜索结果添加到消息历史
┌─────────────────────────────────────────────────────────────────────────┐
│ 🔹 步骤 7: 构建新的消息历史                                              │
├─────────────────────────────────────────────────────────────────────────┤
│  messages.push(                                                          │
│    { role: "assistant", content: "<tool_call>...</tool_call>" },        │
│    { role: "user", content: `以下是搜索结果，请基于这些结果回答：       │
│                                                                           │
│      <search_results>                                                    │
│      AI 摘要：今天北京天气...                                            │
│      搜索结果：...                                                       │
│      </search_results>                                                   │
│                                                                           │
│      请现在根据上述搜索结果，详细回答用户的问题。`                       │
│    }                                                                     │
│  )                                                                       │
│                                                                           │
│  现在 messages 包含 4 条:                                                │
│    1. System Prompt                                                      │
│    2. 用户问题："今天北京的天气怎么样？"                                 │
│    3. AI 工具调用：<tool_call>...</tool_call>                           │
│    4. 搜索结果：<search_results>...</search_results>                    │
└─────────────────────────────────────────────────────────────────────────┘
       │
       ↓ 🔄 重新调用模型
┌─────────────────────────────────────────────────────────────────────────┐
│ 🔹 步骤 8: 调用 AI 模型 (第二次)                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  const newStream = await callModel(messages)                             │
│    → 传入包含搜索结果的完整消息历史                                      │
│    → AI 模型看到搜索结果                                                 │
│    → 基于真实数据生成回答                                               │
│                                                                           │
│  AI 输出内容:                                                            │
│  "根据搜索结果，今天北京的天气情况如下：                                 │
│   - 天气状况：多云转晴                                                   │
│   - 温度范围：15°C - 25°C                                                │
│   - 风力：3-4级                                                          │
│   - 空气质量：良好                                                       │
│   建议您出门时..."                                                       │
└─────────────────────────────────────────────────────────────────────────┘
       │
       ↓ 流式输出每个 token
┌─────────────────────────────────────────────────────────────────────────┐
│ 🔹 步骤 9: 流式返回给前端                                                │
├─────────────────────────────────────────────────────────────────────────┤
│  for await (chunk of newStream) {                                        │
│    content += chunk                                                      │
│    ┌──────────────────────────────────────┐                             │
│    │ SSE 发送到前端                       │                             │
│    │ data: {"content": "根据搜索结果..."} │                             │
│    └──────────────────────────────────────┘                             │
│  }                                                                       │
│                                                                           │
│  💡 前端实时显示打字机效果                                               │
└─────────────────────────────────────────────────────────────────────────┘
       │
       ↓ 流结束
┌─────────────────────────────────────────────────────────────────────────┐
│ 🔹 步骤 10: 保存到数据库                                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  MessageService.addMessage(                                              │
│    conversationId,                                                       │
│    userId,                                                               │
│    'assistant',                                                          │
│    content,          # "根据搜索结果，今天北京的天气..."                 │
│    thinking,         # 如果有思考过程                                    │
│    modelType         # 'volcano' 或 'local'                              │
│  )                                                                       │
│                                                                           │
│  ConversationService.incrementMessageCount(conversationId, userId)       │
│                                                                           │
│  ✅ AI message saved to database                                         │
└─────────────────────────────────────────────────────────────────────────┘
       │
       ↓
┌──────────────┐
│   用户界面    │  显示完整回答 + 打字机效果完成 ✨
└──────────────┘
```

### 关键技术点说明

| 步骤 | 关键技术 | 说明 |
|------|---------|------|
| 步骤 1-2 | 消息构建 | System Prompt 教会模型如何使用工具 |
| 步骤 3-4 | 流式响应 | Server-Sent Events (SSE) 实现打字机效果 |
| 步骤 5 | 正则匹配 | 支持 3 种格式，兼容不同模型 |
| 步骤 6 | API 调用 | Tavily 深度搜索，返回 10 条结果 + AI 摘要 |
| 步骤 7 | Prompt 技巧 | 明确告诉模型"这是搜索结果，请使用" |
| 步骤 8-9 | 递归生成 | 基于搜索结果重新调用模型生成回答 |
| 步骤 10 | 持久化 | MongoDB 保存对话历史 |

### 关键设计

#### 1. **System Prompt 指导**
通过 System Prompt 告诉 AI 模型如何使用工具：

```typescript
const SYSTEM_PROMPT = `
你可以使用以下工具：

### search_web - 联网搜索工具
使用格式：
<tool_call>{"tool": "search_web", "query": "搜索关键词"}</tool_call>

示例：
用户问："今天的新闻有哪些？"
你的输出：<tool_call>{"tool": "search_web", "query": "今天的新闻"}</tool_call>
`;
```

#### 2. **工具调用格式**
支持多种格式以适配不同模型：

**格式 1：完整 XML 标签**（火山引擎偏好）
```xml
<tool_call>{"tool": "search_web", "query": "今天北京天气"}</tool_call>
```

**格式 2：纯 JSON**（本地模型常用）
```json
{"tool": "search_web", "query": "今天北京天气"}
```

#### 3. **工具调用检测**
使用正则表达式检测模型输出中的工具调用：

```typescript
// 1. 优先匹配 XML 标签
const closedTagRegex = /<tool_call>([\s\S]*?)<\/tool_call>/;

// 2. 如果没有标签，匹配纯 JSON
const jsonRegex = /\{[\s\S]*?"tool"[\s\S]*?:[\s\S]*?"search_web"[\s\S]*?\}/;
```

#### 4. **工具执行**
```typescript
async function executeToolCall(toolCall) {
  if (toolCall.tool === 'search_web') {
    // 调用 Tavily API
    const results = await searchWeb(toolCall.query, {
      maxResults: 10,
      searchDepth: 'advanced'
    });
    
    // 格式化结果
    return formatSearchResultsForAI(results);
  }
}
```

#### 5. **结果反馈**
将搜索结果以特殊格式传递回模型：

```typescript
messages.push(
  { role: 'assistant', content: toolCallOutput },
  { role: 'user', content: `以下是搜索结果，请基于这些结果回答：\n\n${searchResults}` }
);

// 重新调用模型
const newStream = await callModel(messages);
```

---

## Tavily 集成封装

### 为什么选择 Tavily？

1. **专为 AI 设计**：返回的内容已经过优化，适合 AI 理解
2. **高质量结果**：比传统搜索引擎更准确
3. **包含 AI 摘要**：Tavily 自己的 AI 会生成结果摘要
4. **易于集成**：官方提供 npm 包 `@tavily/core`

### 封装架构

```
api/tools/tavilySearch.ts
├── searchWeb()           # 基础搜索函数
├── quickSearch()         # 快速搜索（3条结果）
├── deepSearch()          # 深度搜索（10条结果+AI摘要）
└── formatSearchResultsForAI()  # 格式化为 AI 友好格式
```

### 核心封装代码

#### 1. 初始化 Tavily 客户端

```typescript
import { tavily } from '@tavily/core';

const tavilyApiKey = process.env.TAVILY_API_KEY;
const tavilyClient = tavily({ apiKey: tavilyApiKey });
```

#### 2. 搜索函数封装

```typescript
export async function searchWeb(
  query: string,
  options: SearchOptions = {}
): Promise<{
  results: SearchResult[];
  answer?: string;
  query: string;
}> {
  const {
    maxResults = 10,           // 最多返回 10 条结果
    searchDepth = 'advanced',  // 使用深度搜索
    includeAnswer = true,      // 包含 AI 摘要
  } = options;

  // 调用 Tavily API
  const response = await tavilyClient.search(query, {
    maxResults,
    searchDepth,
    includeAnswer,
  });

  // 格式化结果
  const results = response.results.map(result => ({
    title: result.title,
    url: result.url,
    content: result.content,
    score: result.score,
  }));

  return {
    results,
    answer: response.answer,  // Tavily AI 生成的摘要
    query: response.query,
  };
}
```

#### 3. 结果格式化

```typescript
export function formatSearchResultsForAI(
  results: SearchResult[],
  maxLength: number = 8000  // 最大 8000 字符
): string {
  let formatted = '搜索结果：\n\n';

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    formatted += `${i + 1}. ${result.title}\n`;
    formatted += `来源：${result.url}\n`;
    formatted += `内容：${result.content}\n\n`;
    
    if (formatted.length > maxLength) {
      formatted += `\n（结果已截断，共 ${results.length} 条结果）`;
      break;
    }
  }

  return formatted;
}
```

### Tavily API 参数说明

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| `maxResults` | 返回结果数量 | 10 |
| `searchDepth` | 搜索深度 | `'advanced'`（更详细） |
| `includeAnswer` | 是否包含 AI 摘要 | `true` |
| `includeRawContent` | 是否包含原始内容 | `false` |

---

## 技术架构

### 整体架构图

```
┌─────────────┐
│   前端 UI   │
│ ChatInterface│
└──────┬──────┘
       │ HTTP POST /api/chat
       ↓
┌─────────────────────────┐
│   BFF 后端 (chat.ts)     │
├─────────────────────────┤
│ 1. 接收用户消息          │
│ 2. 调用 AI 模型          │
│ 3. 流式返回响应          │
│ 4. 检测工具调用          │
│ 5. 执行搜索工具          │
│ 6. 重新调用模型          │
└──────┬──────────┬───────┘
       │          │
       ↓          ↓
┌──────────┐  ┌────────────────┐
│AI 模型    │  │Tavily Search   │
│(火山/本地)│  │(tavilySearch.ts)│
└──────────┘  └────────────────┘
```

### 数据流

#### 阶段 1：用户提问
```
用户输入："今天北京的天气怎么样？"
  ↓
前端发送：{ message: "...", modelType: "volcano", userId: "..." }
  ↓
后端构建：[
  { role: "system", content: SYSTEM_PROMPT },
  { role: "user", content: "今天北京的天气怎么样？" }
]
```

#### 阶段 2：模型生成工具调用
```
AI 模型输出（流式）：
"<tool_call>{"tool": "search_web", "query": "今天北京天气预报"}</tool_call>"
  ↓
后端检测到工具调用
  ↓
提取：{ tool: "search_web", query: "今天北京天气预报" }
```

#### 阶段 3：执行搜索
```
executeToolCall(toolCall)
  ↓
searchWeb("今天北京天气预报", { maxResults: 10, searchDepth: 'advanced' })
  ↓
Tavily API 返回：
{
  results: [
    { title: "...", url: "...", content: "..." },
    ...
  ],
  answer: "今天北京天气..."
}
  ↓
格式化为：
"AI 摘要：今天北京天气...

搜索结果：
1. 北京天气预报
   来源：...
   内容：...
2. ..."
```

#### 阶段 4：模型生成最终回答
```
消息历史更新：[
  { role: "system", content: SYSTEM_PROMPT },
  { role: "user", content: "今天北京的天气怎么样？" },
  { role: "assistant", content: "<tool_call>..." },
  { role: "user", content: "以下是搜索结果，请基于这些结果回答：\n\n[搜索结果]" }
]
  ↓
重新调用 AI 模型
  ↓
AI 输出："根据搜索结果，今天北京的天气是..."
  ↓
流式返回给前端
```

---

## 遇到的困难

### 困难 1：火山引擎模型不调用工具 ❌

**现象**：
- 模型输出："抱歉，没有找到相关的结果。"
- 不生成工具调用 JSON

**根本原因**：
- System Prompt 不够明确
- 没有提供足够的示例
- 模型不理解应该何时使用工具

### 困难 2：搜索结果被截断 ⚠️

**现象**：
- 模型说"搜索结果被截断"
- 无法提供完整信息

**根本原因**：
```typescript
// 之前：长度限制太小
formatSearchResultsForAI(results, 2000);  // 只有 2000 字符

// 修复后：增加到 8000 字符
formatSearchResultsForAI(results, 8000);
```

### 困难 3：本地模型生成 JSON 但不执行 ❌

**现象**：
- 模型输出：`{"tool": "search_web", "query": "..."}`
- 但搜索没有执行

**根本原因**：
1. **格式问题**：本地模型不加 `<tool_call>` 标签
2. **代码结构错误**：工具执行代码在 if 分支外

```typescript
// 错误的代码结构
if (toolCallResult) {
  const toolResult = await executeToolCall(...);
}  // ← if 结束了

// 但这段代码在外面！
messages.push(..., toolResult);  // ← toolResult 未定义！
```

### 困难 4：模型收到搜索结果但不使用 ⚠️

**现象**：
- 搜索成功（找到 5 条结果）
- 但模型回复"没有找到相关结果"

**根本原因**：
- 模型不理解传递的内容是搜索结果
- 需要明确指示

```typescript
// 之前：只发送原始结果
{ role: 'user', content: toolResult }

// 修复后：明确告诉模型这是搜索结果
{ role: 'user', content: `以下是搜索结果，请基于这些结果回答：\n\n${toolResult}` }
```

### 困难 5：流式响应没有打字机效果 🔄

**现象**：
- 数据在后端生成
- 但前端一次性显示全部内容

**根本原因**：
```typescript
// 之前：有条件判断
if (content !== lastSentContent) {
  await writer.write(...);  // 只有内容变化才发送
}

// 修复后：立即发送
await writer.write(...);  // 每次都发送
```

---

## 排查思路与解决方案

### 排查思路：分层调试法

#### 第 1 层：确认问题存在
```
观察现象 → 确定问题类型 → 制定排查计划
```

#### 第 2 层：添加日志
在关键位置添加详细日志：

```typescript
console.log('✅ 搜索完成，结果数量:', results.length);
console.log('📦 工具执行结果:', toolResult.substring(0, 200));
console.log('📝 完整响应内容:', accumulatedText);
```

#### 第 3 层：追踪数据流
```
用户输入 → 模型输出 → 工具检测 → 工具执行 → 结果返回 → 模型处理
```

在每个环节打印数据，找出断点。

#### 第 4 层：代码审查
检查：
- 变量作用域
- 异步处理
- 条件判断逻辑
- 数据格式转换

### 具体排查案例

#### 案例 1：火山引擎不调用工具

**排查步骤**：
1. ✅ 检查 API 是否正常（用测试脚本验证）
2. ✅ 检查 System Prompt 是否传递
3. ❌ 发现：模型输出不包含工具调用

**解决方案**：
1. 增强 System Prompt，添加更多示例
2. 使用明确的指令："必须使用工具"
3. 提供用户问题的直接对应示例

**效果**：
```typescript
// 修复前
System Prompt: "你可以使用 search_web 工具"

// 修复后
System Prompt: `
示例1 - 用户问："今天的新闻有哪些？"
你的输出：<tool_call>{"tool": "search_web", "query": "今天的新闻"}</tool_call>
`
```

#### 案例 2：本地模型 JSON 格式问题

**排查步骤**：
1. ✅ 添加日志：`console.log('📝 完整响应内容:', accumulatedText)`
2. ✅ 发现：输出是 `{"tool": "search_web", ...}` 没有标签
3. ✅ 检查 `extractToolCall` 函数
4. ❌ 发现：只匹配 XML 标签格式

**解决方案**：
添加纯 JSON 格式匹配：

```typescript
// 新增：匹配纯 JSON
const jsonRegex = /\{[\s\S]*?"tool"[\s\S]*?:[\s\S]*?"search_web"[\s\S]*?\}/;
const jsonMatch = text.match(jsonRegex);

if (jsonMatch) {
  const toolCall = JSON.parse(jsonMatch[0]);
  return { toolCall, remainingText };
}
```

#### 案例 3：搜索结果传递但模型不使用

**排查步骤**：
1. ✅ 日志显示：搜索成功，返回 5 条结果
2. ✅ 日志显示：结果已传递给模型
3. ✅ 检查模型输出：说"没找到结果"
4. ❌ 发现：模型不理解传递的是搜索结果

**解决方案**：
在消息中明确指示：

```typescript
messages.push({
  role: 'user',
  content: `以下是搜索结果，请基于这些搜索结果回答用户的问题：

${toolResult}

请现在根据上述搜索结果，详细回答用户的问题。`
});
```

**效果对比**：
```
修复前：模型说"抱歉没找到"
修复后：模型说"根据搜索结果，今天北京天气..."
```

---

## 关键代码解析

### 1. 工具调用检测

```typescript
function extractToolCall(text: string) {
  // 策略 1：匹配完整 XML 标签
  const closedTagRegex = /<tool_call>([\s\S]*?)<\/tool_call>/;
  if (text.match(closedTagRegex)) {
    // 提取并解析 JSON
    return parseAndReturn();
  }
  
  // 策略 2：匹配开放 XML 标签
  const openTagRegex = /<tool_call>([\s\S]*?)$/;
  if (text.match(openTagRegex)) {
    return parseAndReturn();
  }
  
  // 策略 3：匹配纯 JSON（关键改进）
  const jsonRegex = /\{[\s\S]*?"tool"[\s\S]*?:[\s\S]*?"search_web"[\s\S]*?\}/;
  if (text.match(jsonRegex)) {
    return parseAndReturn();
  }
  
  return null;
}
```

**设计思想**：
- **渐进式匹配**：从严格到宽松
- **兼容性优先**：支持多种模型输出格式
- **容错性强**：标签不闭合也能识别

### 2. 流式响应处理

```typescript
async function streamToSSEResponse(stream, conversationId, userId, messages) {
  for await (const chunk of stream) {
    // 解析每个数据块
    const content = parseStreamChunk(chunk);
    
    if (content) {
      accumulatedText += content;
      
      // 关键：立即发送，不做过滤
      await writer.write(encoder.encode(`data: ${JSON.stringify({
        content: accumulatedText
      })}\n\n`));
    }
    
    // 检查是否完成
    if (isDone) {
      // 检测工具调用
      const toolCall = extractToolCall(accumulatedText);
      
      if (toolCall) {
        // 执行工具
        const result = await executeToolCall(toolCall);
        
        // 将结果传递回模型
        messages.push(
          { role: 'assistant', content: accumulatedText },
          { role: 'user', content: `搜索结果：\n${result}` }
        );
        
        // 重新调用模型
        const newStream = await callModel(messages);
        // 递归处理新的流...
      }
    }
  }
}
```

**设计思想**：
- **增量处理**：逐块处理数据
- **状态管理**：维护累积文本
- **递归调用**：工具执行后重新生成

### 3. 搜索结果格式化

```typescript
export function formatSearchResultsForAI(results, maxLength = 8000) {
  let formatted = '搜索结果：\n\n';
  
  for (let i = 0; i < results.length; i++) {
    const entry = `${i + 1}. ${result.title}\n来源：${result.url}\n内容：${result.content}\n\n`;
    
    // 长度控制
    if (formatted.length + entry.length > maxLength) {
      formatted += `\n（结果已截断，共 ${results.length} 条结果）`;
      break;
    }
    
    formatted += entry;
  }
  
  return formatted;
}
```

**设计思想**：
- **结构化输出**：便于 AI 理解
- **长度控制**：避免超过模型上下文限制
- **截断提示**：告知 AI 有更多结果

---

## 经验总结

### 技术经验

#### 1. **AI 提示工程（Prompt Engineering）很关键**
- ✅ 提供具体示例比抽象描述更有效
- ✅ 格式要求要明确（包括标签、JSON 结构）
- ✅ 多次重复关键指令增强理解

#### 2. **兼容性设计**
- ✅ 支持多种模型（火山引擎、本地 Ollama）
- ✅ 支持多种输出格式（XML 标签、纯 JSON）
- ✅ 渐进式匹配策略

#### 3. **流式处理的挑战**
- ✅ 要理解异步流的工作原理
- ✅ 状态管理要清晰
- ✅ 避免过度过滤导致延迟

#### 4. **日志是最好的调试工具**
```typescript
// 好的日志实践
console.log('🔧 检测到工具调用:', toolCall);
console.log('🔍 执行搜索，查询:', query);
console.log('✅ 搜索完成，结果数量:', count);
console.log('📦 工具执行结果（前200字符）:', result.substring(0, 200));
```

**日志设计原则**：
- 使用 emoji 便于快速识别
- 包含关键数据（但不要太长）
- 标记执行阶段
- 区分正常和异常

### 调试经验

#### 1. **分层排查法**
```
问题定位
  ↓
添加日志
  ↓
追踪数据流
  ↓
定位断点
  ↓
修复验证
```

#### 2. **假设驱动**
1. 提出假设："可能是 XXX 导致的"
2. 设计实验：添加日志或测试
3. 验证假设：观察结果
4. 修正假设：如果不对，换个方向

#### 3. **增量修复**
- 不要一次改太多地方
- 每次修复一个问题
- 修复后立即测试
- 确认有效再继续

### 架构经验

#### 1. **关注点分离**
```
- api/tools/       # 工具实现（Tavily 封装）
- api/services/    # 服务层（模型调用）
- api/lambda/      # API 层（请求处理）
```

#### 2. **可扩展性**
```typescript
// 易于添加新工具
if (tool === 'search_web') {
  return await searchWeb(query);
} else if (tool === 'calculator') {
  return await calculate(expression);
} else if (tool === 'database') {
  return await queryDatabase(sql);
}
```

#### 3. **错误处理**
```typescript
try {
  const result = await searchWeb(query);
  return formatResults(result);
} catch (error) {
  console.error('搜索失败:', error);
  return `<search_error>搜索失败: ${error.message}</search_error>`;
}
```

### 性能优化

#### 1. **搜索参数优化**
```typescript
{
  maxResults: 10,           // 不要太多（成本和延迟）
  searchDepth: 'advanced',  // 平衡质量和速度
  includeAnswer: true,      // Tavily AI 摘要很有用
}
```

#### 2. **结果长度控制**
- 默认 8000 字符（约 2000-3000 tokens）
- 避免超过模型上下文窗口
- 提供截断提示

#### 3. **流式输出优化**
- 立即发送更新（不要等待）
- 减少不必要的条件判断
- 使用 TransformStream 处理

---

## 最终效果

### ✅ 成功指标

1. **火山引擎模型**：
   - ✅ 能识别何时需要搜索
   - ✅ 正确输出工具调用 JSON
   - ✅ 基于搜索结果生成回答

2. **本地模型（Ollama）**：
   - ✅ 支持纯 JSON 格式（无标签）
   - ✅ 正确执行搜索
   - ✅ 提供详细回答

3. **用户体验**：
   - ✅ 流式打字机效果
   - ✅ 实时显示搜索状态
   - ✅ 基于最新信息回答

### 📊 性能数据

| 指标 | 数值 | 说明 |
|------|------|------|
| 搜索响应时间 | 1-3秒 | Tavily API 调用 |
| 模型响应时间 | 2-5秒 | 取决于模型 |
| 搜索结果数量 | 10条 | 平衡质量和成本 |
| 结果字符长度 | 3000-8000 | 足够详细 |

### 🎯 应用场景

1. **实时信息查询**：天气、新闻、股价
2. **知识检索**：教程、文档、指南
3. **数据查询**：统计数据、研究报告
4. **内容推荐**：资源、工具、服务

---

## 主流 AI Agent 工具调用方案对比

### 方案对比总览

目前主流的 AI Agent 工具调用实现主要有两种方案：

| 方案 | 代表 | 调用次数 | 优点 | 缺点 | 我们的方案 |
|------|------|---------|------|------|-----------|
| **原生 Function Calling** | OpenAI GPT-4<br>Anthropic Claude<br>Google Gemini | **1次** | 高效、准确<br>官方支持 | 需要支持的模型<br>格式固定 | ❌ 不支持 |
| **Prompt-based 工具调用** | 开源模型<br>自定义方案 | **2次** | 兼容性强<br>灵活可控 | 效率较低<br>依赖 Prompt | ✅ 当前方案 |

---

### 方案 1：原生 Function Calling（主流大厂方案）

#### 工作原理

现代 AI 模型（GPT-4、Claude 3.5、Gemini 等）内置了 Function Calling 能力，**只需调用一次**：

```typescript
// OpenAI 原生 Function Calling
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [
    { role: "user", content: "今天北京的天气怎么样？" }
  ],
  tools: [
    {
      type: "function",
      function: {
        name: "search_web",
        description: "搜索网络获取最新信息",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "搜索关键词"
            }
          },
          required: ["query"]
        }
      }
    }
  ],
  tool_choice: "auto"  // 模型自动决定是否调用工具
});

// 模型返回
if (response.choices[0].message.tool_calls) {
  // ✅ 模型决定调用工具
  const toolCall = response.choices[0].message.tool_calls[0];
  // { name: "search_web", arguments: '{"query": "今天北京天气"}' }
  
  // 执行工具
  const result = await searchWeb(JSON.parse(toolCall.function.arguments).query);
  
  // 将结果传回（第二次调用）
  const finalResponse = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      ...previousMessages,
      response.choices[0].message,
      {
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result)
      }
    ]
  });
}
```

#### 流程图

```
用户提问："今天北京天气？"
   ↓
调用模型（1次），传入 tools 定义
   ↓
模型内部判断 → 需要工具
   ↓
返回：tool_calls: [{ function: "search_web", arguments: {...} }]
   ↓
后端执行工具（搜索）
   ↓
调用模型（2次），传入工具结果 + role: "tool"
   ↓
模型生成最终回答
```

**优点**：
- ✅ **模型理解更准确**：原生支持，不依赖 Prompt 工程
- ✅ **格式标准化**：JSON Schema 定义，类型安全
- ✅ **支持并行调用**：一次可以调用多个工具
- ✅ **更高的成功率**：模型训练时就包含了工具调用能力

**缺点**：
- ❌ **模型限制**：只有新版本的商业模型支持
- ❌ **成本较高**：需要使用 GPT-4 等高级模型
- ❌ **灵活性受限**：工具格式必须符合规范

#### 代表性实现

**OpenAI GPT-4 Turbo / GPT-4o**
```typescript
tools: [{
  type: "function",
  function: {
    name: "search_web",
    description: "Search the web for current information",
    parameters: { ... }
  }
}]
```

**Anthropic Claude 3.5 Sonnet**
```typescript
tools: [{
  name: "search_web",
  description: "Search the web for current information",
  input_schema: {
    type: "object",
    properties: { ... }
  }
}]
```

**Google Gemini 1.5 Pro**
```typescript
tools: [{
  function_declarations: [{
    name: "search_web",
    description: "Search the web",
    parameters: { ... }
  }]
}]
```

---

### 方案 2：Prompt-based 工具调用（我们的方案）

#### 工作原理

通过 **System Prompt 教会模型**如何使用工具，模型在文本中输出工具调用指令：

```typescript
// 我们的实现方式
const SYSTEM_PROMPT = `
你可以使用工具：
<tool_call>{"tool": "search_web", "query": "关键词"}</tool_call>
`;

// 第一次调用
const response = await model.chat([
  { role: "system", content: SYSTEM_PROMPT },
  { role: "user", content: "今天北京天气？" }
]);

// 模型输出文本：
// "<tool_call>{"tool": "search_web", "query": "今天北京天气"}</tool_call>"

// 后端解析文本，提取工具调用
const toolCall = extractToolCall(response.content);

// 执行工具
const result = await searchWeb(toolCall.query);

// 第二次调用，传入搜索结果
const finalResponse = await model.chat([
  { role: "system", content: SYSTEM_PROMPT },
  { role: "user", content: "今天北京天气？" },
  { role: "assistant", content: response.content },
  { role: "user", content: `搜索结果：${result}` }
]);
```

#### 流程图

```
用户提问："今天北京天气？"
   ↓
调用模型（1次），System Prompt 包含工具说明
   ↓
模型输出文本：<tool_call>{"tool": "search_web", ...}</tool_call>
   ↓
后端正则匹配提取工具调用
   ↓
后端执行工具（搜索）
   ↓
调用模型（2次），将搜索结果作为 user 消息传入
   ↓
模型生成最终回答
```

**优点**：
- ✅ **兼容性强**：任何模型都可以用（包括开源模型）
- ✅ **成本可控**：可以使用便宜的本地模型
- ✅ **高度灵活**：可以自定义任何格式
- ✅ **易于调试**：所有内容都是文本，易于查看

**缺点**：
- ❌ **依赖 Prompt**：需要精心设计 System Prompt
- ❌ **成功率较低**：模型可能不遵循格式
- ❌ **需要解析**：需要正则或 JSON 解析
- ❌ **效率较低**：需要调用两次模型

---

### 实际案例对比

#### 案例：用户问"今天北京天气？"

**OpenAI GPT-4（原生 Function Calling）**

```
调用次数：2次
总耗时：~3-4秒
成功率：~95%+
成本：~$0.03-0.06/次

第1次调用（1秒）：
  输入：messages + tools 定义
  输出：tool_calls: [{ function: "search_web", arguments: {...} }]
  
执行工具（1-2秒）：
  调用 Tavily API
  
第2次调用（1秒）：
  输入：messages + tool_calls + tool 结果
  输出：最终回答
```

**我们的方案（Prompt-based）**

```
调用次数：2次
总耗时：~3-5秒（本地模型）/ ~4-6秒（火山引擎）
成功率：~80-90%（取决于 Prompt 质量）
成本：~$0.01-0.02/次（火山引擎）/ $0（本地模型）

第1次调用（1-2秒）：
  输入：System Prompt + 用户消息
  输出：<tool_call>{"tool": "search_web", ...}</tool_call>
  
后端解析（<0.1秒）：
  正则匹配提取 JSON
  
执行工具（1-2秒）：
  调用 Tavily API
  
第2次调用（1-2秒）：
  输入：原消息 + 工具调用 + 搜索结果
  输出：最终回答
```

---

### 主流 AI Agent 框架的选择

#### LangChain（最流行的 AI Agent 框架）

**支持两种方式**：

1. **原生 Function Calling**（推荐）
```typescript
import { ChatOpenAI } from "langchain/chat_models/openai";
import { TavilySearchResults } from "langchain/tools";

const model = new ChatOpenAI({ model: "gpt-4" });
const tools = [new TavilySearchResults()];

// LangChain 自动处理工具调用
const agent = createReactAgent({ llm: model, tools });
```

2. **Prompt-based**（兼容方案）
```typescript
const model = new ChatOpenAI({ model: "gpt-3.5-turbo" });
// 使用 ReAct Prompt 模板
```

#### AutoGPT / BabyAGI

使用 **原生 Function Calling**，因为它们主要基于 GPT-4。

#### Open Interpreter

混合使用：
- GPT-4：原生 Function Calling
- 开源模型：Prompt-based

---

### 未来趋势

#### 1. **原生 Function Calling 成为标准**

越来越多的模型支持：
- ✅ OpenAI GPT-4 系列
- ✅ Anthropic Claude 3 系列
- ✅ Google Gemini 系列
- ✅ Mistral Large
- 🔄 开源模型逐步支持（如 Llama 3+、Qwen 2.5+）

#### 2. **工具调用变得更智能**

- **并行工具调用**：一次调用多个工具
  ```json
  tool_calls: [
    { function: "search_web", ... },
    { function: "get_weather", ... },
    { function: "query_db", ... }
  ]
  ```

- **工具链（Tool Chaining）**：模型自动规划多步骤
  ```
  搜索 → 分析 → 再次搜索 → 总结
  ```

- **条件工具调用**：根据结果决定是否继续
  ```typescript
  if (result.confidence < 0.8) {
    call("search_web_deep");
  }
  ```

#### 3. **流式工具调用**

新的 API 支持在流式输出中调用工具：
```typescript
for await (const chunk of stream) {
  if (chunk.tool_calls) {
    // 边生成边调用工具
  }
}
```

---

### 我们方案的优化方向

基于主流实践，我们可以考虑以下优化：

#### 优化 1：支持原生 Function Calling

当使用支持的模型时，自动切换到原生模式：

```typescript
async function callModel(messages, tools) {
  if (supportsNativeFunctionCalling(modelType)) {
    // 使用原生 Function Calling
    return await callWithFunctionCalling(messages, tools);
  } else {
    // 使用 Prompt-based（当前方案）
    return await callWithPromptBased(messages, tools);
  }
}
```

#### 优化 2：统一工具定义格式

采用类似 OpenAI 的标准格式：

```typescript
const tools = [
  {
    name: "search_web",
    description: "搜索网络获取最新信息",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索关键词" }
      },
      required: ["query"]
    }
  }
];
```

#### 优化 3：减少调用次数

对于简单查询，尝试在第一次调用时就包含搜索结果：

```typescript
// 预搜索 + 一次调用（实验性）
const preSearchResults = await quickPreSearch(userQuery);
const response = await model.chat([
  { role: "system", content: SYSTEM_PROMPT },
  { role: "user", content: `${userQuery}\n\n参考信息：${preSearchResults}` }
]);
```

---

### 结论

**当前业界主流**：
1. **商业闭源模型**：几乎都使用 **原生 Function Calling**（仍需 2 次调用）
2. **开源模型/自定义方案**：大多使用 **Prompt-based**（我们的方案）

**关键发现**：
- ✅ **即使是原生 Function Calling，也需要 2 次模型调用**
  - 第 1 次：判断是否需要工具 + 生成工具调用
  - 第 2 次：基于工具结果生成最终回答
  
- ✅ **我们的方案是合理的**，与主流开源方案一致
  - LangChain、LlamaIndex 对不支持原生 Function Calling 的模型也是这样做的
  
- ✅ **效率对比**：
  - 原生 Function Calling：~3-4 秒（GPT-4）
  - 我们的方案：~3-5 秒（相差不大）
  
- ✅ **成功率对比**：
  - 原生 Function Calling：~95%+
  - 优化的 Prompt-based：~85-90%（可以通过改进 Prompt 提升）

**建议**：
1. **短期**：继续优化 Prompt，提高成功率到 90%+
2. **中期**：添加原生 Function Calling 支持（当使用 GPT-4 等模型时）
3. **长期**：实现混合模式，根据模型能力自动选择最优方案

---

## 未来优化方向

### 1. 支持更多工具
```typescript
// 计算器
{ tool: 'calculator', expression: '123 * 456' }

// 数据库查询
{ tool: 'database', query: 'SELECT * FROM users' }

// 图片生成
{ tool: 'image_gen', prompt: '一只猫' }
```

### 2. 工具链（Tool Chaining）
```
搜索 → 分析结果 → 再次搜索 → 生成报告
```

### 3. 并行工具调用
```typescript
// 同时搜索多个来源
Promise.all([
  searchWeb('天气'),
  searchWikipedia('北京'),
  queryDatabase('历史数据')
])
```

### 4. 缓存优化
```typescript
// 缓存搜索结果
const cacheKey = `search:${query}`;
const cached = await redis.get(cacheKey);
if (cached) return cached;
```

### 5. 成本控制
```typescript
// 限制搜索频率
const rateLimit = new RateLimiter({
  maxRequests: 10,
  perMinutes: 1
});
```

---

## 参考资源

### 官方文档
- [Tavily API 文档](https://docs.tavily.com/)
- [火山引擎豆包文档](https://www.volcengine.com/docs/82379)
- [Ollama 文档](https://ollama.ai/docs)

### 相关技术
- Server-Sent Events (SSE)
- Streaming API
- Function Calling
- Prompt Engineering

### 项目文档
- [Tavily 搜索指南](./TAVILY_SEARCH_GUIDE.md)
- [火山引擎集成指南](./VOLCENGINE_DOUBAO_GUIDE.md)
- [数据库设计文档](./DATABASE_DESIGN.md)

---

**文档版本**：v1.0  
**最后更新**：2025-11-23  
**维护者**：AI Agent 开发团队

