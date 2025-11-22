# 火山引擎豆包大模型集成指南

本指南介绍如何在 AI Agent 应用中集成火山引擎的豆包大模型（Doubao）。

## 目录

- [功能概述](#功能概述)
- [配置指南](#配置指南)
- [API 使用](#api-使用)
- [功能特性](#功能特性)
- [故障排除](#故障排除)

## 功能概述

火山引擎豆包大模型是字节跳动推出的大语言模型服务，提供强大的自然语言理解和生成能力。本项目已集成豆包模型，支持：

- ✅ 流式响应输出
- ✅ 思维过程（thinking）展示
- ✅ 工具调用（联网搜索）
- ✅ 对话历史管理
- ✅ 与本地模型无缝切换

## 配置指南

### 1. 获取 API Key

1. 访问 [火山引擎 ARK 控制台](https://console.volcengine.com/ark)
2. 登录或注册账号
3. 创建新的 API Key
4. 复制 API Key 备用

### 2. 配置环境变量

在项目根目录的 `.env.local` 或 `.env.production` 文件中添加以下配置：

```bash
# 火山引擎豆包大模型配置
ARK_API_KEY=your_actual_api_key_here
ARK_API_URL=https://ark.cn-beijing.volces.com/api/v3/chat/completions
ARK_MODEL=doubao-1-5-thinking-pro-250415
```

#### 环境变量说明

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `ARK_API_KEY` | 火山引擎 API 密钥 | 无（必填） |
| `ARK_API_URL` | API 端点地址 | `https://ark.cn-beijing.volces.com/api/v3/chat/completions` |
| `ARK_MODEL` | 使用的模型名称 | `doubao-1-5-thinking-pro-250415` |

#### 可选模型

火山引擎提供多个豆包模型版本，你可以根据需求选择：

- `doubao-1-5-thinking-pro-250415` - 豆包 1.5 思维增强版（推荐）
- `doubao-pro-32k` - 豆包 Pro 32K 上下文版
- `doubao-lite-32k` - 豆包 Lite 32K 轻量版
- 更多模型请参考 [火山引擎官方文档](https://www.volcengine.com/docs/82379/1263512)

### 3. 启动应用

配置完成后，启动应用：

```bash
# 开发环境
npm run dev

# 生产环境
npm run build
npm run start
```

## API 使用

### 基本用法

火山引擎大模型服务通过 `/api/chat` 接口调用，请求参数：

```typescript
{
  "message": "你好，介绍一下摄影的基础知识",
  "modelType": "volcano",  // 指定使用火山引擎模型
  "conversationId": "optional-conversation-id",
  "userId": "user123"
}
```

### 响应格式

API 返回 Server-Sent Events (SSE) 流式响应：

```
data: {"conversationId":"conv123","type":"init"}

data: {"content":"你好！","thinking":"分析用户问题..."}

data: {"content":"你好！我很乐意为你介绍摄影的基础知识..."}

data: [DONE]
```

### 代码示例

前端调用示例：

```typescript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    message: '介绍一下摄影',
    modelType: 'volcano',
    userId: 'user123',
  }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') {
        console.log('Stream completed');
        break;
      }
      
      const json = JSON.parse(data);
      console.log('Content:', json.content);
      console.log('Thinking:', json.thinking);
    }
  }
}
```

## 功能特性

### 1. 流式输出

豆包模型支持流式输出，实时返回生成的内容，提供更好的用户体验：

- 逐字输出内容
- 实时显示思考过程
- 降低响应等待时间

### 2. 思维过程展示

豆包 1.5 思维增强版支持显示 AI 的思考过程：

```
<think>
用户问的是摄影基础知识，我应该从以下几个方面介绍：
1. 光圈、快门、ISO 三要素
2. 构图基础
3. 光线运用
</think>

摄影的基础知识包括...
```

系统会自动提取 `<think>` 标签内的内容，并单独展示为"思考过程"。

### 3. 工具调用（联网搜索）

豆包模型支持工具调用，可以在回答中联网搜索最新信息：

```
<tool_call>
{
  "tool": "search_web",
  "query": "2024年最新摄影技巧",
  "options": {
    "maxResults": 5
  }
}
</tool_call>
```

系统会自动：
1. 检测工具调用请求
2. 执行搜索
3. 将搜索结果返回给模型
4. 模型基于搜索结果生成回答

### 4. 对话历史管理

系统自动管理对话历史：

- 每次对话自动创建或关联会话 ID
- 用户消息和 AI 回复自动保存到 MongoDB
- 支持多轮对话上下文记忆

### 5. 与本地模型无缝切换

支持在火山引擎模型和本地 Ollama 模型之间切换：

```typescript
// 使用火山引擎模型
{ modelType: 'volcano' }

// 使用本地 Ollama 模型
{ modelType: 'local' }
```

## 架构设计

### 目录结构

```
api/
├── services/
│   └── volcengineService.ts     # 火山引擎服务封装
└── lambda/
    └── chat.ts                  # 聊天 API 主逻辑
```

### 核心组件

#### 1. VolcengineService

位置：`api/services/volcengineService.ts`

提供火山引擎 API 的封装，包括：

- `chat()` - 发起聊天请求
- `parseStreamLine()` - 解析流式响应
- `isConfigured()` - 检查配置状态

#### 2. Chat API

位置：`api/lambda/chat.ts`

核心功能：

- `callVolcengineModel()` - 调用火山引擎模型
- `streamVolcengineToSSEResponse()` - 处理流式响应
- 工具调用处理
- 对话历史管理

### 数据流

```
用户输入
  ↓
ChatInterface (前端)
  ↓
POST /api/chat
  ↓
chat.ts (后端)
  ↓
volcengineService.chat()
  ↓
火山引擎 API
  ↓
SSE 流式响应
  ↓
前端实时展示
```

## 故障排除

### 1. API Key 未配置

**错误信息：**
```
火山引擎 API 未配置，请设置 ARK_API_KEY 环境变量
```

**解决方法：**
- 检查 `.env.local` 或 `.env.production` 文件是否存在
- 确认 `ARK_API_KEY` 已正确配置
- 重启应用使环境变量生效

### 2. API 调用失败

**错误信息：**
```
火山引擎 API 错误 (401): Unauthorized
```

**可能原因：**
- API Key 无效或已过期
- API Key 没有访问权限

**解决方法：**
- 在火山引擎控制台检查 API Key 状态
- 重新生成新的 API Key
- 确认账户余额充足

### 3. 网络连接问题

**错误信息：**
```
fetch failed
```

**解决方法：**
- 检查网络连接
- 确认可以访问 `ark.cn-beijing.volces.com`
- 检查防火墙或代理设置

### 4. 流式响应中断

**症状：** 回答输出到一半停止

**可能原因：**
- 网络不稳定
- API 超时
- Token 数量超限

**解决方法：**
- 检查网络稳定性
- 增加 `max_tokens` 参数
- 分段发送长对话

### 5. 思维内容不显示

**症状：** 回答正常但思考过程为空

**原因：** 可能使用的不是思维增强版模型

**解决方法：**
- 确认 `ARK_MODEL` 配置为 `doubao-1-5-thinking-pro-250415`
- 部分模型不支持思维过程展示

## 最佳实践

### 1. 模型选择

- **需要思维过程展示**：使用 `doubao-1-5-thinking-pro-250415`
- **需要长上下文**：使用 `doubao-pro-32k`
- **注重成本效益**：使用 `doubao-lite-32k`

### 2. 参数调优

在 `volcengineService.ts` 中可以调整参数：

```typescript
await volcengineService.chat(messages, {
  temperature: 0.7,    // 创造性：0-1，越高越随机
  maxTokens: 4000,     // 最大生成长度
  topP: 0.95,          // 采样范围：0-1
});
```

### 3. 错误处理

始终包装 API 调用在 try-catch 中：

```typescript
try {
  const stream = await callVolcengineModel(messages);
  return streamVolcengineToSSEResponse(stream, ...);
} catch (error) {
  console.error('调用失败:', error);
  return errorResponse('模型调用失败，请稍后重试');
}
```

### 4. 监控和日志

系统已内置详细日志：

```typescript
console.log('🔥 调用火山引擎大模型:', { ... });
console.log('✅ 火山引擎 API 响应成功');
console.error('❌ 火山引擎 API 错误:', { ... });
```

建议在生产环境配置日志收集系统。

## 性能优化

### 1. 并发控制

避免同时发起大量请求，建议：
- 单用户同时最多 2-3 个请求
- 实现请求队列管理

### 2. 缓存策略

对于重复查询，可以考虑：
- 缓存常见问题的回答
- 使用 Redis 存储会话历史

### 3. 流式输出优化

- 使用 TransformStream 处理流
- 避免在流处理中执行重操作
- 及时释放资源

## 扩展开发

### 添加新功能

1. **支持图片输入**：修改 `VolcengineRequest` 接口，添加 `images` 字段
2. **支持函数调用**：扩展工具调用系统，支持更多工具
3. **多模型对比**：同时调用多个模型，展示对比结果

### 自定义 System Prompt

在 `chat.ts` 中修改 `SYSTEM_PROMPT` 常量：

```typescript
const SYSTEM_PROMPT = `你是一位专业的助手，擅长...`;
```

## 参考资源

- [火山引擎 ARK 官方文档](https://www.volcengine.com/docs/82379/1263512)
- [豆包大模型介绍](https://www.volcengine.com/product/doubao)
- [API 参考文档](https://www.volcengine.com/docs/82379/1263279)

## 更新日志

### v1.0.0 (2025-11-22)

- ✅ 初始版本发布
- ✅ 支持流式输出
- ✅ 支持思维过程展示
- ✅ 支持工具调用（联网搜索）
- ✅ 完整的错误处理

## 技术支持

如遇到问题，请：

1. 查看本文档的故障排除部分
2. 检查控制台日志输出
3. 访问火山引擎官方文档
4. 提交 Issue 到项目仓库

---

**注意：** 使用火山引擎 API 会产生费用，请合理控制调用量。建议在开发阶段使用本地模型，生产环境再切换到火山引擎。

