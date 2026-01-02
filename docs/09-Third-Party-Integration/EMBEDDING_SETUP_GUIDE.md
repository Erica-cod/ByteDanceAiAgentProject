# Embedding 模型配置指南

## 概述

多Agent系统使用火山引擎的embedding模型来计算文本相似度。本文档介绍如何正确配置embedding功能。

## 快速配置

### 方案1：使用预置模型（推荐新手）

在 `.env` 文件中添加：

```env
ARK_API_KEY=your_api_key_here
ARK_EMBEDDING_API_URL=https://ark.cn-beijing.volces.com/api/v3/embeddings
ARK_EMBEDDING_MODEL=doubao-embedding-text-240715
```

### 方案2：使用Endpoint模型（推荐生产环境）

1. **在火山引擎控制台创建推理接入点**：
   - 登录 [火山引擎控制台](https://console.volcengine.com/ark/)
   - 进入"模型推理"页面
   - 创建新的推理接入点，选择 `doubao-embedding-text-240715` 模型
   - 获得endpoint ID（格式：`ep-20241209xxxxx`）

2. **配置环境变量**：

```env
ARK_API_KEY=your_api_key_here
ARK_EMBEDDING_API_URL=https://ark.cn-beijing.volces.com/api/v3/embeddings
ARK_EMBEDDING_MODEL=ep-20241209xxxxx  # 你的endpoint ID
# 或直接使用：ARK_EMBEDDING_MODEL=doubao-embedding-text-240715
```

## 可用模型

### 文本Embedding模型

| 模型名称 | 说明 | 向量维度 | 适用场景 |
|---------|------|---------|---------|
| `doubao-embedding-text-240715` | 通用文本embedding（推荐） | 768 | 通用场景 |
| `ep-xxxxx` | 自定义endpoint | 取决于模型 | 生产环境 |

**注意**：不要使用多模态embedding模型（如 `doubao-embedding-vision-250615`），这些模型用于视频/图片embedding。

## 验证配置

### 方法1：使用测试脚本

创建 `test-embedding.js` 文件：

```javascript
import fetch from 'node-fetch';

const ARK_API_KEY = process.env.ARK_API_KEY;
const ARK_EMBEDDING_MODEL = process.env.ARK_EMBEDDING_MODEL || 'doubao-embedding-text-240715';

async function testEmbedding() {
  try {
    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ARK_API_KEY}`,
      },
      body: JSON.stringify({
        model: ARK_EMBEDDING_MODEL,
        input: ['测试文本', '天很蓝'],
        encoding_format: 'float',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ API调用失败:', error);
      return;
    }

    const data = await response.json();
    console.log('✅ Embedding API工作正常！');
    console.log(`   向量数量: ${data.data.length}`);
    console.log(`   向量维度: ${data.data[0].embedding.length}`);
    console.log(`   向量前5个值: ${data.data[0].embedding.slice(0, 5)}`);
  } catch (error) {
    console.error('❌ 错误:', error);
  }
}

testEmbedding();
```

运行：
```bash
node test-embedding.js
```

### 方法2：使用curl测试

```bash
curl https://ark.cn-beijing.volces.com/api/v3/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "doubao-embedding-text-240715",
    "input": ["天很蓝", "海很深"],
    "encoding_format": "float"
  }'
```

**成功响应示例**：
```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [0.12, -0.34, 0.56, ...],
      "index": 0
    }
  ],
  "model": "doubao-embedding",
  "usage": {
    "prompt_tokens": 3,
    "total_tokens": 3
  }
}
```

## 常见问题

### Q1: 出现 "doubao-embedding-text-240715 does not exist" 错误

**原因**：
- 模型名称错误
- API Key无权限访问该模型
- 使用了错误的endpoint

**解决方法**：
1. 检查模型名称是否正确
2. 在火山引擎控制台确认API Key权限
3. 尝试创建endpoint并使用endpoint ID
4. 或者移除embedding配置，系统会自动使用简单相似度

### Q2: 系统自动降级到简单相似度

**现象**：日志显示 `⚠️ [Host] Embedding计算失败，使用简单方法`

**说明**：这是正常的fallback机制，功能不受影响。

**如需启用embedding**：
1. 按照上述步骤正确配置
2. 重启应用
3. 查看日志确认 `✅ [Embedding] 配置完成`

### Q3: Embedding vs 简单相似度的区别

| 特性 | Embedding相似度 | 简单相似度 |
|-----|----------------|-----------|
| 精度 | 高（语义级别） | 中（关键词级别） |
| 依赖 | 需要API调用 | 无依赖 |
| 速度 | 慢（网络请求） | 快（本地计算） |
| 成本 | 有API费用 | 无成本 |
| 可靠性 | 依赖外部服务 | 100%可用 |

**建议**：
- 开发测试阶段：使用简单相似度即可
- 生产环境：配置embedding以获得更好效果

## API请求格式

### 标准文本Embedding请求

```json
POST https://ark.cn-beijing.volces.com/api/v3/embeddings
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY

{
  "model": "doubao-embedding-text-240715",
  "input": ["文本1", "文本2"],
  "encoding_format": "float"
}
```

### 响应格式

```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [0.1, 0.2, ...],  // 768维向量
      "index": 0
    },
    {
      "object": "embedding",
      "embedding": [0.3, 0.4, ...],
      "index": 1
    }
  ],
  "model": "doubao-embedding-text-240715",
  "usage": {
    "prompt_tokens": 10,
    "total_tokens": 10
  }
}
```

## 注意事项

### 不要使用多模态模型

❌ **错误配置**：
```env
ARK_EMBEDDING_MODEL=doubao-embedding-vision-250615
```

这是**多模态**embedding模型，用于处理图片和视频，不适合纯文本场景。

✅ **正确配置**：
```env
ARK_EMBEDDING_MODEL=doubao-embedding-text-240715
```

### 监控API使用量

Embedding API会产生费用，建议：
1. 在火山引擎控制台监控API调用量
2. 设置费用告警
3. 开发环境使用简单相似度

### 性能优化

1. **批量调用**：系统已自动批量获取embedding，减少API调用次数
2. **缓存**：未来可以添加embedding缓存，避免重复计算
3. **降级策略**：系统已实现自动降级，确保稳定性

## 调试技巧

### 查看详细日志

启动应用后，如果配置正确，会看到：

```
✅ [Embedding] 配置完成: doubao-embedding-text-240715
   API URL: https://ark.cn-beijing.volces.com/api/v3/embeddings
```

embedding调用时会显示：

```
🔍 [Embedding] 批量获取 2 个文本的embedding...
   模型: doubao-embedding-text-240715
   端点: https://ark.cn-beijing.volces.com/api/v3/embeddings
✅ [Embedding] 成功获取 2 个向量 (维度: 768)
```

### 如果出现错误

系统会显示详细的错误信息和解决建议：

```
❌ [Embedding] API返回错误 (404)
   错误详情: {...}
模型 "doubao-embedding-text-240715" 不存在或无权限访问。
请检查：
1. 在火山引擎控制台确认模型名称
2. 确保API Key有权限访问embedding模型
3. 或设置 ARK_EMBEDDING_MODEL 环境变量为正确的模型名
```

## 相关文档

- [火山引擎文档 - Text Embedding](https://www.volcengine.com/docs/82379/1263482)
- [多Agent快速开始](../MULTI_AGENT_QUICKSTART.md)
- [多Agent协议规范](./MULTI_AGENT_PROTOCOL.md)

---

**最后更新**: 2024-12-09  
**维护者**: AI Agent Team

