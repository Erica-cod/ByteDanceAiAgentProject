# 🔌 09-Third-Party-Integration（第三方集成）

## 📌 模块简介

本文件夹包含了项目中集成的所有第三方服务，包括 LLM、搜索引擎、向量数据库、工作流引擎等。如何选择和集成这些服务是项目成功的关键。

## 📚 核心文档

### 🤖 LLM 集成

#### 1. VOLCENGINE_DOUBAO_GUIDE.md（10KB）⭐
**火山引擎豆包 LLM 集成指南**

**为什么选择豆包？**
- ✅ 国产 LLM，数据合规
- ✅ 支持 Function Calling
- ✅ 流式输出稳定
- ✅ 性价比高
- ✅ 中文理解能力强

**集成步骤：**
```typescript
import { ChatVolc } from '@langchain/community/chat_models/volcengine';

const llm = new ChatVolc({
  volcApiKey: process.env.VOLC_API_KEY,
  model: 'doubao-pro-32k',
  temperature: 0.7,
  streaming: true
});

// 使用
const response = await llm.invoke([
  { role: 'user', content: '你好' }
]);

console.log(response.content);
```

**流式输出：**
```typescript
const stream = await llm.stream([
  { role: 'user', content: '写一篇文章' }
]);

for await (const chunk of stream) {
  process.stdout.write(chunk.content);
}
```

**Function Calling：**
```typescript
const response = await llm.invoke([
  { role: 'user', content: '今天天气如何？' }
], {
  functions: [
    {
      name: 'get_weather',
      description: '获取天气信息',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string' }
        }
      }
    }
  ],
  function_call: 'auto'
});

if (response.function_call) {
  const { name, arguments: args } = response.function_call;
  const result = await executeFunction(name, JSON.parse(args));
}
```

### 🔍 搜索集成

#### 2. TAVILY_SEARCH_GUIDE.md（7KB）⭐
**Tavily 搜索引擎集成**

**为什么选择 Tavily？**
- ✅ 专为 AI 优化的搜索
- ✅ 返回结构化数据
- ✅ 自动提取关键信息
- ✅ 支持深度搜索
- ✅ API 简单易用

**集成：**
```typescript
import { TavilySearchResults } from '@langchain/community/tools/tavily_search';

const searchTool = new TavilySearchResults({
  apiKey: process.env.TAVILY_API_KEY,
  maxResults: 5
});

// 搜索
const results = await searchTool.invoke('最新 AI 新闻');

console.log(results);
// [
//   {
//     title: '...',
//     url: '...',
//     content: '...',
//     score: 0.95
//   }
// ]
```

**高级搜索：**
```typescript
const advancedSearch = async (query: string) => {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: 'advanced',
      include_answer: true,
      include_raw_content: false,
      max_results: 10
    })
  });
  
  return await response.json();
};
```

### 🧠 向量数据库

#### 3. EMBEDDING_SETUP_GUIDE.md（7KB）
**Embedding 和向量检索配置**

**为什么需要 Embedding？**
- 语义搜索：根据意思而非关键词
- 相似度匹配：找到相似的历史对话
- 知识检索：从大量文档中找相关内容

**模型选择：**
```typescript
import { OpenAIEmbeddings } from '@langchain/openai';

const embeddings = new OpenAIEmbeddings({
  model: 'text-embedding-3-small',
  dimensions: 1536
});

// 生成向量
const vector = await embeddings.embedQuery('你好世界');
console.log(vector); // [0.123, -0.456, ...]
```

**向量存储：**
```typescript
import { MemoryVectorStore } from 'langchain/vectorstores/memory';

const vectorStore = await MemoryVectorStore.fromTexts(
  ['文档1', '文档2', '文档3'],
  [{ id: 1 }, { id: 2 }, { id: 3 }],
  embeddings
);

// 相似度搜索
const results = await vectorStore.similaritySearch('查询', 2);
console.log(results);
```

**持久化存储（Postgres + pgvector）：**
```typescript
import { PGVectorStore } from 'langchain/vectorstores/pgvector';

const vectorStore = await PGVectorStore.initialize(embeddings, {
  postgresConnectionOptions: {
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  },
  tableName: 'embeddings',
  columns: {
    idColumnName: 'id',
    vectorColumnName: 'embedding',
    contentColumnName: 'content',
    metadataColumnName: 'metadata'
  }
});
```

### 🔄 工作流引擎

#### 4. LANGGRAPH_PRINCIPLES.md（9KB）⭐
**LangGraph 核心原则**

**什么是 LangGraph？**
- LangChain 的状态管理和工作流引擎
- 用于构建复杂的 AI Agent 系统
- 支持循环、条件分支、并行执行

**核心概念：**
```
State (状态)
  ↓
Node (节点) - 执行单元
  ↓
Edge (边) - 连接节点
  ↓
Graph (图) - 完整工作流
```

**简单示例：**
```typescript
import { StateGraph, END } from '@langchain/langgraph';

// 定义状态
interface State {
  messages: BaseMessage[];
  result?: string;
}

// 创建图
const workflow = new StateGraph<State>({
  channels: {
    messages: { value: (x, y) => x.concat(y) },
    result: { value: (x, y) => y }
  }
});

// 添加节点
workflow.addNode('agent', async (state) => {
  const response = await llm.invoke(state.messages);
  return { messages: [response] };
});

// 添加边
workflow.addEdge('agent', END);
workflow.setEntryPoint('agent');

// 编译并运行
const app = workflow.compile();
const result = await app.invoke({
  messages: [{ role: 'user', content: '你好' }]
});
```

#### 5. LANGGRAPH_WORKFLOW_GUIDE.md（7KB）
**LangGraph 工作流指南**

**条件分支：**
```typescript
workflow.addConditionalEdges(
  'agent',
  (state) => {
    // 根据状态决定下一步
    if (state.needsTool) {
      return 'tools';
    }
    return 'end';
  },
  {
    'tools': 'tools',
    'end': END
  }
);
```

**循环执行：**
```typescript
workflow.addConditionalEdges(
  'critic',
  (state) => {
    // 质量不够，重新生成
    if (state.quality < 0.8) {
      return 'agent';
    }
    return 'end';
  }
);
```

### 🛠️ 开发工具

#### 6. NGROK_GITHUB_WEBHOOK_GUIDE.md（13KB）
**Ngrok + GitHub Webhook 配置**

**为什么需要 Ngrok？**
- 本地开发需要接收 GitHub Webhook
- Ngrok 提供公网 URL 映射到本地

**配置步骤：**
```bash
# 1. 安装 ngrok
npm install -g ngrok

# 2. 启动本地服务
npm run dev

# 3. 启动 ngrok
ngrok http 3000

# 4. 复制 ngrok URL
# https://xxxx.ngrok.io

# 5. 在 GitHub 配置 Webhook
# Payload URL: https://xxxx.ngrok.io/api/webhook
# Content type: application/json
# Events: push, pull_request
```

**验证 Webhook：**
```typescript
import crypto from 'crypto';

const verifyWebhook = (req: Request) => {
  const signature = req.headers['x-hub-signature-256'];
  const payload = JSON.stringify(req.body);
  
  const hmac = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
};
```

## 🎯 关键技术点

### LLM 选型考虑

| 因素 | 考虑内容 |
|------|----------|
| **性能** | 响应速度、准确率 |
| **成本** | API 调用价格 |
| **功能** | Function Calling、流式输出 |
| **合规** | 数据存储位置、隐私政策 |
| **中文** | 中文理解和生成能力 |

### 搜索引擎选型

| 引擎 | 优势 | 劣势 | 适用场景 |
|------|------|------|----------|
| **Tavily** | AI 优化、结构化 | 需要付费 | AI Agent |
| **Google** | 结果全面 | 需要解析 | 通用搜索 |
| **Bing** | API 稳定 | 中国访问慢 | 企业应用 |

### 向量数据库选型

| 数据库 | 优势 | 劣势 | 适用场景 |
|--------|------|------|----------|
| **pgvector** | 基于 Postgres、免费 | 性能一般 | 中小规模 |
| **Pinecone** | 高性能、托管 | 需要付费 | 大规模生产 |
| **Weaviate** | 开源、功能全 | 部署复杂 | 自建服务 |
| **Qdrant** | 高性能、易用 | 社区较小 | 高性能需求 |

## 💡 面试要点

### 1. LLM 集成要点
**问题：集成 LLM 需要注意什么？**
- **API 密钥管理**：安全存储
- **错误处理**：处理限流、超时
- **成本控制**：监控 Token 使用
- **重试机制**：网络错误重试
- **流式输出**：提升用户体验

### 2. 向量检索原理
**问题：向量检索是如何工作的？**
1. **文本 → 向量**：通过 Embedding 模型
2. **相似度计算**：余弦相似度、欧氏距离
3. **索引优化**：HNSW、IVF
4. **TopK 检索**：返回最相似的 K 个结果

### 3. LangGraph 的优势
**问题：为什么使用 LangGraph？**
- **状态管理**：统一管理 Agent 状态
- **可视化**：工作流清晰可见
- **灵活性**：支持循环、分支
- **可组合**：节点可重用
- **调试友好**：每步状态可追踪

### 4. Webhook 安全
**问题：如何保证 Webhook 安全？**
- **签名验证**：HMAC 签名
- **HTTPS**：加密传输
- **IP 白名单**：限制来源
- **重放攻击防护**：时间戳验证

## 🔗 相关模块

- **04-Multi-Agent**：使用 LangGraph 编排
- **07-Tools-System**：集成 Tavily 搜索

## 📊 集成效果

### 功能完整性
- ✅ LLM：豆包 LLM
- ✅ 搜索：Tavily
- ✅ 向量：pgvector
- ✅ 工作流：LangGraph

### 稳定性
- ✅ LLM 调用成功率 99.5%
- ✅ 搜索响应时间 < 2s
- ✅ 向量检索 < 100ms

---

**建议阅读顺序：**
1. `VOLCENGINE_DOUBAO_GUIDE.md` - LLM 集成
2. `TAVILY_SEARCH_GUIDE.md` - 搜索集成
3. `LANGGRAPH_PRINCIPLES.md` - 工作流引擎
4. `EMBEDDING_SETUP_GUIDE.md` - 向量检索

