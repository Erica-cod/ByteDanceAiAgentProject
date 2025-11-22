# Tavily 搜索工具集成指南

## 功能概述

本项目集成了 Tavily API，为 AI Agent 提供实时联网搜索能力。AI 可以自主判断何时需要搜索，并自动调用搜索工具获取最新信息。

## 特性

- ✅ 实时网络搜索
- ✅ AI 自主判断是否需要搜索
- ✅ 自动工具调用和结果处理
- ✅ 流式响应支持
- ✅ 搜索结果格式化

## 配置步骤

### 1. 获取 Tavily API Key

访问 [Tavily 官网](https://tavily.com/) 注册并获取 API Key。

### 2. 配置环境变量

在 `.env.local`（开发环境）或 `.env.production`（生产环境）中添加：

```bash
TAVILY_API_KEY=your_tavily_api_key_here
```

### 3. 重启应用

```bash
# 开发环境
npm run dev

# 生产环境
npm run serve
```

## 使用方式

### AI 自动调用

AI 会自动判断何时需要搜索。例如：

**用户问：** "2024年最新的 React 19 有哪些新特性？"

**AI 行为：**
1. 在 `<think>` 标签中思考是否需要搜索
2. 判断需要最新信息，生成工具调用请求
3. 自动执行搜索
4. 基于搜索结果生成回答

### 搜索触发场景

AI 通常会在以下情况触发搜索：

- 用户询问最新的新闻、数据或趋势
- 用户需要具体的教程或资源推荐
- 用户询问当前事件或实时信息
- 用户需要权威数据或统计信息

## API 使用示例

### 基础搜索

```typescript
import { searchWeb } from './api/tools/tavilySearch';

// 执行搜索
const { results, query } = await searchWeb('React 19 新特性', {
  maxResults: 5,
  searchDepth: 'basic'
});

// 处理结果
results.forEach(result => {
  console.log(result.title);
  console.log(result.url);
  console.log(result.content);
});
```

### 快速搜索

```typescript
import { quickSearch } from './api/tools/tavilySearch';

// 只返回前 3 条结果
const results = await quickSearch('Python 教程');
```

### 深度搜索

```typescript
import { deepSearch } from './api/tools/tavilySearch';

// 返回更多结果和 AI 摘要
const { results, answer } = await deepSearch('机器学习入门');

console.log('AI 摘要:', answer);
console.log('搜索结果:', results);
```

### 格式化结果

```typescript
import { formatSearchResultsForAI } from './api/tools/tavilySearch';

const results = await quickSearch('Node.js 最佳实践');
const formatted = formatSearchResultsForAI(results, 1000);

// 可以直接发送给 AI
console.log(formatted);
```

## 工具调用协议

### 请求格式

AI 使用以下格式调用搜索工具：

```xml
<tool_call>
{
  "tool": "search_web",
  "query": "搜索查询内容",
  "options": {
    "maxResults": 5,
    "searchDepth": "basic"
  }
}
</tool_call>
```

### 响应格式

系统返回搜索结果：

```xml
<search_results>
搜索结果：

1. 标题
来源：URL
内容：摘要内容

2. 标题
来源：URL
内容：摘要内容
</search_results>
```

## 配置选项

### SearchOptions

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `maxResults` | `number` | `5` | 最大结果数量 |
| `searchDepth` | `'basic' \| 'advanced'` | `'basic'` | 搜索深度 |
| `includeAnswer` | `boolean` | `false` | 是否包含 AI 生成的答案摘要 |
| `includeRawContent` | `boolean` | `false` | 是否包含原始网页内容 |

## 前端集成

前端无需特殊处理，搜索过程对用户是透明的：

1. 用户发送消息
2. AI 开始生成回答
3. 如需搜索，显示"正在搜索..."提示
4. 搜索完成后，AI 继续生成基于搜索结果的回答
5. 用户看到完整的回答

## 最佳实践

### 1. 合理使用搜索

不是所有问题都需要搜索，AI 会智能判断：

**需要搜索：**
- "最新的 AI 技术趋势"
- "2024年值得学习的编程语言"
- "React 19 发布了吗？"

**无需搜索：**
- "什么是递归？"（基础知识）
- "如何学习编程？"（通用建议）
- "帮我分析一下我的兴趣"（个人讨论）

### 2. 搜索查询优化

AI 会自动优化搜索查询，但你可以在 System Prompt 中指导：

```typescript
// 在 SYSTEM_PROMPT 中添加
使用搜索时，确保查询：
1. 简洁明确
2. 包含关键时间信息（如年份）
3. 使用专业术语
4. 避免过于宽泛的查询
```

### 3. 结果处理

搜索结果会自动格式化并限制长度，确保 AI 能有效处理。

## 故障排查

### 问题：搜索不工作

**检查：**
1. `TAVILY_API_KEY` 是否正确配置
2. 查看服务器日志是否有错误
3. 检查 API Key 配额是否用尽

### 问题：搜索结果质量不佳

**解决：**
1. 使用 `searchDepth: 'advanced'` 提高搜索深度
2. 增加 `maxResults` 获取更多结果
3. 优化搜索查询关键词

### 问题：搜索速度慢

**优化：**
1. 使用 `quickSearch` 只获取 3 条结果
2. 使用 `searchDepth: 'basic'` 基础搜索
3. 考虑缓存常见查询结果

## 成本优化

Tavily API 按搜索次数计费，建议：

1. **智能判断：** 让 AI 判断是否真的需要搜索
2. **结果缓存：** 对常见查询缓存结果
3. **限制结果数：** 根据需求设置合适的 `maxResults`
4. **监控使用：** 定期检查 Tavily 仪表板

## 示例场景

### 场景1：用户询问最新教程

```
用户: 有什么好的 TypeScript 5.0 教程推荐吗？

AI 思考: 用户需要最新的 TypeScript 5.0 教程，需要搜索
      
AI 调用: search_web("TypeScript 5.0 教程推荐 2024")

搜索结果: [返回 5 条相关教程链接和内容]

AI 回答: 基于最新的搜索结果，我为你找到了几个优秀的 TypeScript 5.0 教程...
```

### 场景2：用户询问基础概念

```
用户: 什么是函数式编程？

AI 思考: 这是基础概念问题，我可以直接回答，无需搜索

AI 回答: 函数式编程是一种编程范式...（不触发搜索）
```

## 扩展开发

### 添加新工具

可以参考 `tavilySearch.ts` 创建其他工具：

```typescript
// api/tools/customTool.ts
export async function customTool(params: any) {
  // 实现你的工具逻辑
}
```

然后在 `chat.ts` 的 `executeToolCall` 中注册：

```typescript
if (tool === 'custom_tool') {
  return await customTool(params);
}
```

## 参考资源

- [Tavily API 文档](https://docs.tavily.com/)
- [项目 GitHub 仓库](https://github.com/your-repo)
- [问题反馈](https://github.com/your-repo/issues)

## 更新日志

### v1.0.0 (2025-11-22)
- ✅ 集成 Tavily API
- ✅ 实现自动工具调用
- ✅ 支持流式响应
- ✅ 添加搜索结果格式化

