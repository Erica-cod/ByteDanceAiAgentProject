# 🔧 可插拔工具系统 V2 设计文档

## 📋 设计目标

### 解决的核心问题
1. ❌ **旧方案问题**：基于 Prompt 解析不稳定，模型容易幻觉
2. ❌ **多步执行问题**：用户要求"列计划→查方案→更新计划"，模型只做第一步
3. ❌ **并发问题**：高并发下外部 API 被打爆
4. ❌ **扩展困难**：添加新工具需要修改多处代码

### 新方案特性
- ✅ 基于 Function Calling，结构化调用
- ✅ 插件式架构，零侵入添加新工具
- ✅ 内置限流、熔断、缓存
- ✅ 支持工具编排（多步执行）
- ✅ 完整的监控和日志

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    Tool System V2                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │          Tool Registry (工具注册中心)             │  │
│  │  - 自动发现 /tools/plugins 下的所有工具          │  │
│  │  - 验证工具定义                                   │  │
│  │  - 生成 Function Calling Schema                  │  │
│  └──────────────────────────────────────────────────┘  │
│                       ↓                                  │
│  ┌──────────────────────────────────────────────────┐  │
│  │       Tool Executor (工具执行器)                  │  │
│  │  - 限流控制 (Rate Limiter)                       │  │
│  │  - 缓存管理 (Cache Manager)                      │  │
│  │  - 熔断器 (Circuit Breaker)                      │  │
│  │  - 超时控制 (Timeout Handler)                    │  │
│  └──────────────────────────────────────────────────┘  │
│                       ↓                                  │
│  ┌──────────────────────────────────────────────────┐  │
│  │    Tool Orchestrator (工具编排器)                │  │
│  │  - 多步骤执行计划                                │  │
│  │  - 依赖解析                                      │  │
│  │  - 失败重试                                      │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 📦 核心组件

### 1. Tool Plugin（工具插件）
每个工具都是独立的插件，遵循标准接口：

```typescript
interface ToolPlugin {
  // 工具元数据
  metadata: {
    name: string;
    description: string;
    version: string;
    author: string;
  };
  
  // Function Calling Schema
  schema: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
  
  // 限流配置
  rateLimit?: {
    maxConcurrent: number;
    maxPerMinute: number;
    timeout: number;
  };
  
  // 缓存配置
  cache?: {
    enabled: boolean;
    ttl: number; // 秒
  };
  
  // 熔断配置
  circuitBreaker?: {
    enabled: boolean;
    failureThreshold: number;
    resetTimeout: number;
  };
  
  // 执行函数
  execute: (params: any, context: ToolContext) => Promise<ToolResult>;
  
  // 验证函数（可选）
  validate?: (params: any) => ValidationResult;
}
```

### 2. Tool Registry（工具注册中心）
- 自动扫描 `plugins/` 目录
- 验证工具定义
- 生成 OpenAI Function Calling Schema

### 3. Tool Executor（工具执行器）
- 限流控制
- 缓存管理
- 熔断保护
- 超时控制

### 4. Tool Orchestrator（工具编排器）
- 解析多步执行计划
- 管理工具依赖关系
- 失败重试和降级

---

## 🔌 插件示例

```typescript
// plugins/search-web.plugin.ts
export const searchWebPlugin: ToolPlugin = {
  metadata: {
    name: 'search_web',
    description: '搜索互联网获取最新信息',
    version: '1.0.0',
    author: 'AI Agent Team',
  },
  
  schema: {
    name: 'search_web',
    description: '搜索互联网获取实时信息、新闻、事实核查',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索查询关键词',
        },
        max_results: {
          type: 'number',
          description: '返回的最大结果数',
          default: 5,
        },
      },
      required: ['query'],
    },
  },
  
  rateLimit: {
    maxConcurrent: 50,
    maxPerMinute: 100,
    timeout: 10000,
  },
  
  cache: {
    enabled: true,
    ttl: 300, // 5 分钟
  },
  
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    resetTimeout: 60000,
  },
  
  async execute(params, context) {
    const { query, max_results = 5 } = params;
    
    try {
      const results = await tavilySearch(query, { maxResults: max_results });
      
      return {
        success: true,
        data: results,
        message: `找到 ${results.length} 条结果`,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};
```

---

## 🚀 使用方式

### 旧方案（Prompt 解析）
```typescript
// ❌ 不稳定
const prompt = `
可用工具：
- search_web: 搜索网络
使用格式：<tool_call>search_web: AI 技术</tool_call>
`;

const response = await llm.chat(prompt);
// 可能返回："<tool_call>search_web: AI 技术</tool_call>"
// 需要手动解析，容易出错
```

### 新方案（Function Calling）
```typescript
// ✅ 结构化
const tools = toolRegistry.getAllSchemas();

const response = await openai.chat.completions.create({
  model: 'gpt-4-turbo',
  messages: [{ role: 'user', content: '搜索 AI 最新技术' }],
  tools: tools,
  tool_choice: 'auto',
});

// 自动返回结构化数据：
// {
//   tool_calls: [{
//     function: {
//       name: 'search_web',
//       arguments: '{"query": "AI 最新技术", "max_results": 5}'
//     }
//   }]
// }

// 执行工具
const result = await toolExecutor.execute('search_web', params, context);
```

---

## 📊 监控指标

系统提供完整的监控指标：

```typescript
GET /api/tools/status

{
  "tools": [
    {
      "name": "search_web",
      "status": "healthy",
      "metrics": {
        "concurrent": "5/50",
        "perMinute": "23/100",
        "utilizationRate": "10%",
        "cacheHitRate": "45%",
        "averageLatency": "234ms",
        "errorRate": "0.2%"
      }
    }
  ],
  "timestamp": "2025-01-02T10:00:00Z"
}
```

---

## 🔄 迁移计划

### Phase 1：核心框架（3-5 天）
- [x] ToolPlugin 接口定义
- [ ] Tool Registry 实现
- [ ] Tool Executor 基础实现
- [ ] 限流器集成

### Phase 2：插件迁移（5-7 天）
- [ ] 搜索工具插件化
- [ ] 计划工具插件化
- [ ] 时间工具插件化
- [ ] 旧 API 兼容层

### Phase 3：高级特性（7-10 天）
- [ ] 工具编排器
- [ ] 熔断器
- [ ] 缓存管理
- [ ] 监控面板

---

## 📚 参考资料

- [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)
- [Prompt Engineering Guide](https://www.promptingguide.ai/zh/applications/function_calling)
- [Semantic Kernel Migration Guide](https://learn.microsoft.com/semantic-kernel/migration/function-calling)

