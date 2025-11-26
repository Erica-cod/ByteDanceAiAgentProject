# 工具幻觉防范指南

## 📋 目录

- [什么是工具幻觉](#什么是工具幻觉)
- [为什么会出现工具幻觉](#为什么会出现工具幻觉)
- [已实施的防范措施](#已实施的防范措施)
- [添加新工具的步骤](#添加新工具的步骤)
- [最佳实践](#最佳实践)
- [监控和诊断](#监控和诊断)

---

## 什么是工具幻觉

**工具幻觉(Tool Hallucination)**是指 AI 模型在使用基于 Prompt 的工具调用时,出现以下错误行为:

| 问题类型 | 具体表现 | 风险等级 |
|---------|---------|---------|
| 编造工具 | 调用不存在的工具 | 🔴 高 |
| 工具选择错误 | 应该用工具A却用了工具B | 🟡 中 |
| 参数错误 | 传递了错误的参数名或类型 | 🟡 中 |
| 工具混淆 | 混淆相似工具的用途 | 🟡 中 |
| 格式错误 | JSON 格式不正确 | 🟢 低 |

### 示例

```typescript
// ❌ 编造工具
<tool_call>{"tool": "calculator", "expression": "123+456"}</tool_call>
// 问题: calculator 工具不存在

// ❌ 参数名错误
<tool_call>{"tool": "search_web", "keyword": "天气"}</tool_call>
// 问题: 参数名应该是 query 不是 keyword

// ❌ 格式错误
<tool_call>{'tool': 'search_web', 'query': '天气'}</tool_call>
// 问题: JSON 必须使用双引号

// ✅ 正确
<tool_call>{"tool": "search_web", "query": "天气"}</tool_call>
```

---

## 为什么会出现工具幻觉

### 根本原因

```
Prompt-based 工具调用方案的局限性
  ↓
工具定义以自然语言形式存在于 Prompt 中
  ↓
模型依赖理解能力而非类型约束
  ↓
当工具数量增多时,模型可能"遗忘"或混淆
  ↓
导致幻觉或错误调用
```

### 具体因素

1. **上下文窗口限制**: 工具定义占用了大量 tokens
2. **注意力衰减**: 模型对长文本后半部分的关注度下降
3. **缺乏类型约束**: 没有原生 Function Calling 的 JSON Schema 约束
4. **模型能力限制**: 开源模型的指令遵循能力相对较弱
5. **相似工具混淆**: 多个功能相似的工具容易混淆

### 风险评估

| 工具数量 | 幻觉风险 | 预期成功率 | 状态 |
|---------|---------|-----------|------|
| 1-3个 | 低 (5-10%) | 90-95% | ✅ 安全 |
| 4-8个 | 中 (15-25%) | 75-85% | ⚠️ 需优化 |
| 9-15个 | 高 (30-40%) | 60-70% | ⚠️ 需工具路由 |
| 16+个 | 极高 (>40%) | <60% | ❌ 需架构升级 |

**当前状态**: 我们只有 1 个工具 (search_web),风险很低 ✅

---

## 已实施的防范措施

### 1. 工具验证层 ✅

**文件**: `api/tools/toolValidator.ts`

**功能**:
- ✅ 验证工具是否存在
- ✅ 验证参数完整性和类型
- ✅ 提供友好的错误提示
- ✅ 标准化工具调用(移除多余参数)
- ✅ 智能建议(如拼写错误时推荐正确工具名)

**示例**:

```typescript
import { validateToolCall } from '../tools/toolValidator.js';

const validation = validateToolCall(toolCall);
if (!validation.valid) {
  console.error('❌ 工具调用验证失败:', validation.error);
  // 返回错误提示给模型
  return {
    resultText: `<tool_error>${validation.error}</tool_error>`,
  };
}
```

### 2. 结构化工具定义 ✅

**文件**: `api/tools/toolValidator.ts` - `TOOL_REGISTRY`

**特点**:
- 集中管理所有工具定义
- JSON Schema 风格的参数定义
- 包含示例和描述
- 支持动态生成 Prompt

**注册表结构**:

```typescript
export const TOOL_REGISTRY = new Map<string, ToolDefinition>([
  [
    'search_web',
    {
      name: 'search_web',
      description: '联网搜索最新信息、新闻、教程、资源',
      requiredParams: ['query'],
      optionalParams: ['maxResults', 'searchDepth'],
      paramTypes: {
        query: 'string',
        maxResults: 'number',
        searchDepth: 'string',
      },
      examples: [
        {
          input: '今天北京天气?',
          toolCall: { tool: 'search_web', query: '今天北京天气预报' },
        },
      ],
    },
  ],
]);
```

### 3. 动态 Prompt 生成 ✅

**文件**: `api/lambda/chat.ts` - `buildSystemPrompt()`

**优势**:
- 自动从工具注册表生成 Prompt
- 确保 Prompt 和实际工具定义一致
- 包含正例和反例示例
- 强调"只能使用列出的工具"

**生成的 Prompt 结构**:

```
你是AI助手...

## 可用工具清单 (共 N 个)

### 1. search_web
**用途**: 联网搜索...
**必填参数**:
  - query (string): 必填
**调用格式**:
<tool_call>{"tool": "search_web", "query": "..."}</tool_call>
**示例**:
...

---

## 重要规则
1. 只能使用上述 N 个工具,不要编造其他工具
2. 严格按照调用格式,参数名必须完全匹配
...

## 错误示例 ❌
(反例教学)
```

### 4. 错误反馈机制 ✅

**文件**: `api/lambda/chat.ts` - `executeToolCall()`

**流程**:

```
模型输出工具调用
  ↓
验证工具调用 (validateToolCall)
  ↓
[如果失败]
  ↓
返回错误信息给模型
  ↓
模型看到错误,可以重试或调整
```

**错误信息格式**:

```xml
<tool_error>
工具调用错误: 工具 "calculator" 不存在
提示: 可用工具: search_web
</tool_error>
```

---

## 添加新工具的步骤

### 步骤 1: 在工具注册表中注册

**文件**: `api/tools/toolValidator.ts`

```typescript
export const TOOL_REGISTRY = new Map<string, ToolDefinition>([
  // 现有工具
  ['search_web', { ... }],
  
  // ✅ 新增工具
  [
    'calculator',
    {
      name: 'calculator',
      description: '执行数学计算',
      requiredParams: ['expression'],
      optionalParams: [],
      paramTypes: {
        expression: 'string',
      },
      examples: [
        {
          input: '计算 123 + 456',
          toolCall: { tool: 'calculator', expression: '123 + 456' },
        },
      ],
    },
  ],
]);
```

### 步骤 2: 实现工具函数

**文件**: `api/tools/calculator.ts` (新建)

```typescript
export async function calculate(expression: string): Promise<number> {
  // 实现计算逻辑
  // 注意: 做好安全检查,防止代码注入
  return eval(expression); // 实际项目中不要直接用 eval
}
```

### 步骤 3: 在 executeToolCall 中添加分支

**文件**: `api/lambda/chat.ts`

```typescript
async function executeToolCall(toolCall: any) {
  // ... 验证逻辑 ...
  
  const { tool } = normalizedToolCall;
  
  if (tool === 'search_web') {
    // 现有逻辑
  } else if (tool === 'calculator') {
    // ✅ 新增分支
    const { expression } = normalizedToolCall;
    const result = await calculate(expression);
    return {
      resultText: `<calculation_result>${result}</calculation_result>`,
    };
  }
  
  // 未知工具(理论上不会到这里,因为已经验证过)
  throw new Error(`未实现的工具: ${tool}`);
}
```

### 步骤 4: 测试新工具

```bash
# 启动服务
npm run dev

# 测试对话
用户: "帮我计算 123 + 456"
AI: <tool_call>{"tool": "calculator", "expression": "123 + 456"}</tool_call>
系统: 执行工具 → 返回结果
AI: "计算结果是 579"
```

### 步骤 5: 监控和优化

- 查看日志中的工具调用成功率
- 收集失败案例并优化 Prompt
- 如果工具数量超过 5 个,考虑引入工具路由

---

## 最佳实践

### ✅ DO (推荐做法)

#### 1. 使用清晰的工具命名

```typescript
// ✅ 好的命名
'search_web'      // 清晰表达用途
'query_database'  // 动词+名词
'translate_text'  // 动作明确

// ❌ 不好的命名
'search'          // 太泛化
'db'              // 缩写不清晰
'tool1'           // 无意义
```

#### 2. 参数名要直观

```typescript
// ✅ 好的参数名
{ query: "北京天气" }
{ expression: "123 + 456" }
{ sourceLanguage: "en", targetLanguage: "zh" }

// ❌ 不好的参数名
{ q: "..." }          // 缩写
{ input: "..." }      // 太泛化
{ param1: "..." }     // 无意义
```

#### 3. 提供丰富的示例

```typescript
examples: [
  // 至少 2-3 个示例
  { input: '...', toolCall: {...} },
  { input: '...', toolCall: {...} },
  { input: '...', toolCall: {...} },
]
```

#### 4. 明确必填和可选参数

```typescript
requiredParams: ['query'],           // 必填
optionalParams: ['maxResults'],      // 可选
```

#### 5. 添加详细的描述

```typescript
description: '联网搜索最新信息、新闻、教程、资源'  // 具体说明用途和场景
```

### ❌ DON'T (避免做法)

#### 1. 不要让工具名太相似

```typescript
// ❌ 容易混淆
'search_web'
'search_database'
'search_local'

// ✅ 改进
'search_web'
'query_database'
'find_local_file'
```

#### 2. 不要一次添加太多工具

```typescript
// ❌ 一次性添加 10 个工具
// 会导致 Prompt 过长,模型混淆

// ✅ 逐步添加,每次 2-3 个
// 充分测试后再添加下一批
```

#### 3. 不要忽略工具冲突

```typescript
// ❌ 功能重叠的工具
'calculate'      // 计算器
'evaluate_math'  // 数学评估

// ✅ 合并为一个工具
'calculator'     // 统一的计算工具
```

#### 4. 不要跳过验证

```typescript
// ❌ 直接执行工具
const { tool, query } = toolCall;
if (tool === 'search_web') {
  await searchWeb(query);
}

// ✅ 先验证再执行
const validation = validateToolCall(toolCall);
if (!validation.valid) {
  return error;
}
const { tool, query } = validation.normalizedToolCall;
```

---

## 监控和诊断

### 日志监控

**关键日志**:

```typescript
// ✅ 成功调用
console.log('✅ 工具调用验证通过:', tool, params);
console.log('✅ 搜索完成，结果数量:', count);

// ❌ 失败调用
console.error('❌ 工具调用验证失败:', error);
console.error('❌ 搜索失败:', error);
```

### 统计指标

建议追踪以下指标:

| 指标 | 计算方式 | 目标值 |
|------|---------|-------|
| 工具调用成功率 | 成功次数 / 总次数 | >90% |
| 验证通过率 | 验证通过 / 工具调用次数 | >95% |
| 平均响应时间 | 总时间 / 调用次数 | <3秒 |
| 错误率 | 错误次数 / 总次数 | <5% |

### 诊断命令

```bash
# 查看所有工具调用日志
grep "🔧 开始执行工具调用" logs/app.log

# 查看验证失败日志
grep "❌ 工具调用验证失败" logs/app.log

# 统计各工具使用频率
grep "✅ 工具调用验证通过" logs/app.log | awk '{print $5}' | sort | uniq -c
```

### 常见问题诊断

#### 问题1: 模型总是编造不存在的工具

**症状**:
```
❌ 工具调用验证失败: 工具 "calculator" 不存在
❌ 工具调用验证失败: 工具 "translator" 不存在
```

**可能原因**:
1. System Prompt 中没有明确列出所有可用工具
2. 模型看到的示例中包含了未注册的工具
3. 用户的问题暗示了某个工具的存在

**解决方案**:
1. 检查 `SYSTEM_PROMPT` 是否使用了 `generateToolPrompt()`
2. 强化 Prompt 中的"只能使用列出的工具"规则
3. 添加反例示例

#### 问题2: 模型总是传递错误的参数名

**症状**:
```
❌ 工具调用验证失败: 缺少必填参数: query
实际收到的参数: { tool: 'search_web', keyword: '...' }
```

**可能原因**:
1. 示例中参数名不一致
2. Prompt 中的格式说明不清楚
3. 模型"记住"了之前的错误用法

**解决方案**:
1. 统一所有示例中的参数名
2. 在 Prompt 中明确标注"参数名必须完全匹配"
3. 添加"参数名错误"的反例

#### 问题3: 验证通过但工具执行失败

**症状**:
```
✅ 工具调用验证通过: search_web
❌ 搜索失败: API key invalid
```

**可能原因**:
1. 工具本身的问题(API key, 网络等)
2. 参数值不合法(但类型正确)
3. 外部服务异常

**解决方案**:
1. 检查环境变量配置
2. 添加参数值的业务逻辑验证
3. 实现重试机制

---

## 未来优化方向

### 阶段 1: 工具数量 3-5 个

**需要做**:
- ✅ 工具分类(search, data, utility)
- ✅ 优化 Prompt 长度
- ✅ 收集失败案例并分析

### 阶段 2: 工具数量 5-10 个

**需要做**:
- ✅ 实现工具路由机制
- ✅ 引入 RAG 动态加载工具定义
- ✅ 添加工具使用统计

### 阶段 3: 工具数量 10+ 个

**需要做**:
- ✅ 迁移到原生 Function Calling
- ✅ 实现混合模式(根据模型能力自动选择)
- ✅ 建立工具调用监控系统

---

好的！让我详细介绍一下这两个扩展阶段的方案：

---

## 🔧 阶段 2: 工具数量 5-10 个时的优化方案

当你的项目工具数量扩展到 **5-10 个**时，就需要引入更高级的机制了。

### 1. **工具路由机制** 🚦

**问题**: 当有 10 个工具时，System Prompt 会变得很长，模型容易混淆。

**解决方案**: 采用**两阶段选择**策略

```typescript
// 第一阶段：工具分类
const TOOL_CATEGORIES = {
  search: {
    description: '搜索和查询类工具',
    tools: ['search_web', 'search_wikipedia', 'search_arxiv']
  },
  data: {
    description: '数据处理和分析工具',
    tools: ['query_database', 'analyze_data', 'export_csv']
  },
  utility: {
    description: '实用工具',
    tools: ['calculator', 'translator', 'timer']
  },
  creative: {
    description: '创作类工具',
    tools: ['image_gen', 'text_to_speech']
  }
};

// 实现路由函数
async function selectToolWithRouting(userQuery: string, messages: ChatMessage[]) {
  // 🔹 第一步: 选择类别
  const categoryPrompt = `
用户问题: "${userQuery}"

可用工具类别:
1. search - 搜索和查询类工具
2. data - 数据处理和分析工具  
3. utility - 实用工具
4. creative - 创作类工具

请选择最合适的类别(只输出类别名):`;

  const categoryResponse = await model.chat([
    { role: 'system', content: '你是工具路由助手' },
    { role: 'user', content: categoryPrompt }
  ]);
  
  const selectedCategory = categoryResponse.trim(); // 例如: "search"
  
  // 🔹 第二步: 只加载该类别的工具
  const toolsInCategory = TOOL_CATEGORIES[selectedCategory].tools;
  const refinedPrompt = generateToolPrompt(toolsInCategory); // 只生成这3个工具的定义
  
  // 🔹 第三步: 使用精简的 Prompt 调用模型
  const finalResponse = await model.chat([
    { role: 'system', content: refinedPrompt },
    ...messages
  ]);
  
  return finalResponse;
}
```

**优势**:
- ✅ **减少 Prompt 长度**: 每次只展示 2-4 个相关工具，而不是全部 10 个
- ✅ **提高准确率**: 模型不会被无关工具干扰
- ✅ **降低成本**: 更短的 Prompt = 更少的 tokens

**效果对比**:

| 方式 | Prompt 长度 | 成功率 | 调用次数 |
|-----|------------|--------|---------|
| 不分类 | ~3000 tokens | 65-75% | 2次 |
| 工具路由 | ~1000 tokens | 80-90% | 3次(多1次选类别) |

---

### 2. **RAG 动态加载工具定义** 🔍

**问题**: 有时候用户的意图不明确，很难提前选择类别。

**解决方案**: 使用**向量检索**动态选择最相关的工具

```typescript
// 预处理：为每个工具生成 embedding
import { getEmbedding } from './embeddingService.js';

const TOOL_EMBEDDINGS = new Map();

async function initToolEmbeddings() {
  for (const [name, tool] of TOOL_REGISTRY) {
    // 将工具的名称+描述+示例转成文本
    const toolText = `
      工具名: ${tool.name}
      用途: ${tool.description}
      示例: ${tool.examples.map(e => e.input).join(', ')}
    `;
    
    // 生成 embedding 向量
    const embedding = await getEmbedding(toolText);
    TOOL_EMBEDDINGS.set(name, embedding);
  }
}

// 运行时：根据用户查询动态检索
async function selectRelevantTools(userQuery: string, topK: number = 3) {
  // 1. 为用户查询生成 embedding
  const queryEmbedding = await getEmbedding(userQuery);
  
  // 2. 计算与每个工具的相似度
  const similarities = [];
  for (const [toolName, toolEmbedding] of TOOL_EMBEDDINGS) {
    const similarity = cosineSimilarity(queryEmbedding, toolEmbedding);
    similarities.push({ toolName, similarity });
  }
  
  // 3. 返回最相关的 topK 个工具
  similarities.sort((a, b) => b.similarity - a.similarity);
  return similarities.slice(0, topK).map(s => s.toolName);
  
  // 结果例如: ['search_web', 'search_wikipedia', 'translator']
}

// 使用
async function chatWithDynamicTools(userQuery: string) {
  // 🔹 动态选择最相关的 3 个工具
  const relevantTools = await selectRelevantTools(userQuery, 3);
  
  // 🔹 只为这 3 个工具生成 Prompt
  const dynamicPrompt = generateToolPrompt(relevantTools);
  
  // 🔹 调用模型
  const response = await model.chat([
    { role: 'system', content: dynamicPrompt },
    { role: 'user', content: userQuery }
  ]);
  
  return response;
}
```

**示例**:

```typescript
// 用户问题: "今天北京天气怎么样?"
await selectRelevantTools("今天北京天气怎么样?", 3);

// 返回最相关的工具:
// ['search_web', 'query_database', 'translator']
// ↓
// 只在 Prompt 中包含这 3 个工具的定义
```

**优势**:
- ✅ **智能选择**: 自动找到最相关的工具
- ✅ **用户无感**: 不需要用户知道有多少工具
- ✅ **可扩展性强**: 即使有 50 个工具，每次也只加载 3-5 个

---

### 3. **工具使用统计** 📊

**目的**: 了解哪些工具最常用，优化 Prompt 顺序和路由策略

```typescript
// 统计接口
interface ToolStats {
  toolName: string;
  callCount: number;        // 调用次数
  successCount: number;     // 成功次数
  failureCount: number;     // 失败次数
  avgLatency: number;       // 平均延迟
  lastUsed: Date;           // 最后使用时间
}

// 统计服务
class ToolUsageTracker {
  private stats = new Map<string, ToolStats>();
  
  // 记录调用
  recordCall(toolName: string, success: boolean, latency: number) {
    const stat = this.stats.get(toolName) || {
      toolName,
      callCount: 0,
      successCount: 0,
      failureCount: 0,
      avgLatency: 0,
      lastUsed: new Date()
    };
    
    stat.callCount++;
    stat.successCount += success ? 1 : 0;
    stat.failureCount += success ? 0 : 1;
    stat.avgLatency = (stat.avgLatency * (stat.callCount - 1) + latency) / stat.callCount;
    stat.lastUsed = new Date();
    
    this.stats.set(toolName, stat);
  }
  
  // 获取热门工具
  getTopTools(limit: number = 5): string[] {
    return Array.from(this.stats.values())
      .sort((a, b) => b.callCount - a.callCount)
      .slice(0, limit)
      .map(s => s.toolName);
  }
  
  // 生成报告
  generateReport() {
    console.log('📊 工具使用统计报告:');
    for (const stat of this.stats.values()) {
      console.log(`
        工具: ${stat.toolName}
        调用次数: ${stat.callCount}
        成功率: ${(stat.successCount / stat.callCount * 100).toFixed(1)}%
        平均延迟: ${stat.avgLatency.toFixed(0)}ms
        最后使用: ${stat.lastUsed.toISOString()}
      `);
    }
  }
}

// 使用
const tracker = new ToolUsageTracker();

async function executeToolCallWithTracking(toolCall: any) {
  const startTime = Date.now();
  try {
    const result = await executeToolCall(toolCall);
    const latency = Date.now() - startTime;
    tracker.recordCall(toolCall.tool, true, latency);
    return result;
  } catch (error) {
    const latency = Date.now() - startTime;
    tracker.recordCall(toolCall.tool, false, latency);
    throw error;
  }
}

// 定期生成报告
setInterval(() => {
  tracker.generateReport();
}, 3600000); // 每小时
```

**报告示例**:

```
📊 工具使用统计报告:

工具: search_web
调用次数: 156
成功率: 94.2%
平均延迟: 1820ms
最后使用: 2025-11-26T10:30:45Z

工具: calculator
调用次数: 42
成功率: 100%
平均延迟: 50ms
最后使用: 2025-11-26T10:25:12Z

工具: translator
调用次数: 28
成功率: 96.4%
平均延迟: 450ms
最后使用: 2025-11-26T10:15:33Z
```

**用途**:
- 📈 优化 Prompt 中工具的顺序(热门工具放前面)
- 🔍 发现很少使用的工具(考虑移除)
- 🐛 发现高失败率的工具(需要优化)

---

## 🚀 阶段 3: 工具数量 10+ 个时的架构升级

当工具数量超过 **10 个**时，Prompt-based 方案已经接近极限，需要考虑架构升级。

### 1. **迁移到原生 Function Calling** ⚡

**核心变化**: 从"文本解析"变为"结构化 API"

```typescript
// ❌ 旧方案: Prompt-based
const SYSTEM_PROMPT = `
你可以使用以下工具:
1. search_web - 搜索...
2. calculator - 计算...
... (10+ 个工具定义)
`;

// ✅ 新方案: 原生 Function Calling
const tools = [
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: '联网搜索最新信息',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词'
          },
          maxResults: {
            type: 'number',
            description: '最大结果数'
          }
        },
        required: ['query']
      }
    }
  },
  // ... 其他 10+ 个工具
];

// 调用模型
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [...],
  tools: tools,           // 传递工具定义
  tool_choice: 'auto'     // 模型自动决定是否调用
});

// 模型返回
if (response.choices[0].message.tool_calls) {
  // ✅ 已经是结构化的 JSON,不需要正则解析
  const toolCall = response.choices[0].message.tool_calls[0];
  // { id: 'xxx', function: { name: 'search_web', arguments: '{"query":"..."}' } }
}
```

**优势对比**:

| 特性 | Prompt-based | 原生 Function Calling |
|-----|-------------|---------------------|
| 成功率 | 70-85% | 95%+ |
| 参数验证 | 手动 | JSON Schema 自动验证 |
| 支持工具数 | <15 | 100+ |
| 并行调用 | ❌ 不支持 | ✅ 支持 |
| 模型要求 | 任何模型 | 需要支持的模型 |

---

### 2. **实现混合模式** 🔀

**目标**: 根据使用的模型自动选择最优方案

```typescript
// 模型能力检测
const MODEL_CAPABILITIES = {
  'gpt-4': { supportsFunctionCalling: true },
  'gpt-4-turbo': { supportsFunctionCalling: true },
  'claude-3-5-sonnet': { supportsFunctionCalling: true },
  'doubao-pro': { supportsFunctionCalling: false },  // 火山引擎
  'deepseek-r1:7b': { supportsFunctionCalling: false }, // 本地模型
};

// 智能调用函数
async function callModelWithTools(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  modelType: string
) {
  const capabilities = MODEL_CAPABILITIES[modelType];
  
  if (capabilities?.supportsFunctionCalling) {
    // 🟢 方案 A: 使用原生 Function Calling
    console.log('✅ 使用原生 Function Calling');
    return await callWithNativeFunctionCalling(messages, tools, modelType);
  } else {
    // 🟡 方案 B: 降级到 Prompt-based
    console.log('⚠️ 降级到 Prompt-based (模型不支持原生 Function Calling)');
    return await callWithPromptBased(messages, tools, modelType);
  }
}

// 原生 Function Calling 实现
async function callWithNativeFunctionCalling(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  modelType: string
) {
  // 转换工具定义为 OpenAI 格式
  const openaiTools = tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          [...tool.requiredParams, ...tool.optionalParams].map(param => [
            param,
            {
              type: tool.paramTypes[param],
              description: `参数: ${param}`
            }
          ])
        ),
        required: tool.requiredParams
      }
    }
  }));
  
  // 调用模型
  const response = await openai.chat.completions.create({
    model: modelType,
    messages: messages,
    tools: openaiTools,
    tool_choice: 'auto'
  });
  
  // 处理 tool_calls
  if (response.choices[0].message.tool_calls) {
    const toolCall = response.choices[0].message.tool_calls[0];
    return {
      hasToolCall: true,
      toolCall: {
        tool: toolCall.function.name,
        ...JSON.parse(toolCall.function.arguments)
      }
    };
  }
  
  return {
    hasToolCall: false,
    content: response.choices[0].message.content
  };
}

// Prompt-based 实现 (现有方案)
async function callWithPromptBased(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  modelType: string
) {
  // 使用现有的 Prompt-based 方案
  const systemPrompt = generateToolPrompt(tools.map(t => t.name));
  // ... 现有逻辑
}
```

**使用示例**:

```typescript
// 用户配置使用的模型
const userModel = 'gpt-4';  // 或 'doubao-pro', 'deepseek-r1:7b'

// 自动选择最优方案
const response = await callModelWithTools(
  messages,
  Array.from(TOOL_REGISTRY.values()),
  userModel
);

// 如果是 gpt-4 → 使用原生 Function Calling (成功率 95%)
// 如果是 doubao-pro → 使用 Prompt-based (成功率 80-85%)
```

---

### 3. **建立工具调用监控系统** 📈

**目标**: 可视化监控，及时发现问题

```typescript
// 监控指标
interface MonitoringMetrics {
  // 实时指标
  currentQPS: number;           // 每秒查询数
  activeToolCalls: number;      // 进行中的工具调用
  
  // 累计指标
  totalCalls: number;           // 总调用次数
  successRate: number;          // 成功率
  avgLatency: number;           // 平均延迟
  
  // 错误统计
  errorsByType: Map<string, number>;  // 按错误类型统计
  
  // 工具分布
  toolDistribution: Map<string, number>;  // 各工具使用占比
}

// 监控服务
class ToolMonitoringService {
  private metrics: MonitoringMetrics;
  
  // 实时更新仪表盘
  updateDashboard() {
    console.clear();
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║           🔧 工具调用监控仪表盘                            ║
╚═══════════════════════════════════════════════════════════╝

📊 实时指标:
  QPS (每秒查询): ${this.metrics.currentQPS}
  进行中的调用: ${this.metrics.activeToolCalls}

📈 累计统计:
  总调用次数: ${this.metrics.totalCalls}
  成功率: ${(this.metrics.successRate * 100).toFixed(2)}%
  平均延迟: ${this.metrics.avgLatency.toFixed(0)}ms

🔥 热门工具 (Top 5):
${this.getTopTools(5).map((t, i) => 
  `  ${i + 1}. ${t.name}: ${t.count} 次 (${(t.percentage * 100).toFixed(1)}%)`
).join('\n')}

❌ 错误统计:
${this.getErrorStats().map(e => 
  `  ${e.type}: ${e.count} 次`
).join('\n')}
    `);
  }
  
  // 告警规则
  checkAlerts() {
    // 成功率低于 85%
    if (this.metrics.successRate < 0.85) {
      this.sendAlert('⚠️ 警告: 工具调用成功率低于 85%');
    }
    
    // 平均延迟超过 3 秒
    if (this.metrics.avgLatency > 3000) {
      this.sendAlert('⚠️ 警告: 工具调用平均延迟超过 3 秒');
    }
    
    // 某个工具失败率超过 20%
    for (const [tool, stats] of this.toolStats) {
      if (stats.failureRate > 0.2) {
        this.sendAlert(`⚠️ 警告: 工具 ${tool} 失败率超过 20%`);
      }
    }
  }
}

// 启动监控
const monitor = new ToolMonitoringService();
setInterval(() => {
  monitor.updateDashboard();
  monitor.checkAlerts();
}, 5000); // 每 5 秒刷新
```

**仪表盘效果**:

```
╔═══════════════════════════════════════════════════════════╗
║           🔧 工具调用监控仪表盘                            ║
╚═══════════════════════════════════════════════════════════╝

📊 实时指标:
  QPS (每秒查询): 12.5
  进行中的调用: 3

📈 累计统计:
  总调用次数: 1,247
  成功率: 92.35%
  平均延迟: 1,850ms

🔥 热门工具 (Top 5):
  1. search_web: 568 次 (45.5%)
  2. translator: 234 次 (18.8%)
  3. calculator: 189 次 (15.2%)
  4. query_database: 156 次 (12.5%)
  5. image_gen: 100 次 (8.0%)

❌ 错误统计:
  tool_not_found: 12 次
  param_type_error: 8 次
  api_timeout: 5 次
```

---

## 📊 三个阶段对比总结

| 阶段 | 工具数量 | 核心方案 | 成功率 | 复杂度 |
|-----|---------|---------|--------|--------|
| **阶段 1** | 1-3 个 | 基础验证 | 90-95% | 低 ✅ |
| **阶段 2** | 5-10 个 | 工具路由 + RAG | 80-90% | 中 ⚠️ |
| **阶段 3** | 10+ 个 | 原生 Function Calling | 95%+ | 高 🔴 |

---

## 💡 实施建议

**当前状态**: 你在**阶段 1** (只有 1 个工具) ✅

**何时升级**:
- 工具数量达到 **4-5 个** → 开始规划阶段 2
- 工具数量达到 **8-10 个** → 必须实施阶段 2
- 工具数量达到 **15+ 个** → 考虑阶段 3

**建议路径**:
1. 先把阶段 1 用好(充分测试验证器)
2. 逐步添加工具到 5 个左右
3. 收集统计数据,评估是否需要阶段 2
4. 只有在真正需要 15+ 工具时才升级到阶段 3

记住:**不要过早优化!** 在真正遇到问题之前,保持简单就是最好的方案 😊

## 参考资源

### 相关文档
- [工具调用实现总结](./TOOL_CALLING_IMPLEMENTATION.md)
- [Tavily 搜索指南](./TAVILY_SEARCH_GUIDE.md)

### 外部资源
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [LangChain Tool Calling](https://python.langchain.com/docs/modules/agents/tools/)
- [Prompt Engineering Guide](https://www.promptingguide.ai/)

---

**文档版本**: v1.0  
**最后更新**: 2025-11-26  
**维护者**: AI Agent 开发团队

