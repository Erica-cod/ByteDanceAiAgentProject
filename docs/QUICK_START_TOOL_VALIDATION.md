# 工具验证快速入门

本指南帮助你快速了解如何使用新的工具验证系统。

---

## 🎯 核心功能

新的工具验证系统提供以下功能:

✅ **自动验证工具调用** - 防止模型调用不存在的工具  
✅ **参数类型检查** - 确保参数类型正确  
✅ **智能错误提示** - 提供友好的错误信息和建议  
✅ **标准化处理** - 自动移除多余参数  
✅ **动态 Prompt 生成** - 从工具注册表自动生成 System Prompt  

---

## 📦 新增文件

```
api/
├── tools/
│   ├── toolValidator.ts          # ✨ 工具验证器(核心)
│   └── __tests__/
│       └── toolValidator.test.ts # ✨ 测试文件
└── lambda/
    └── chat.ts                    # 已更新,使用验证器

docs/
├── TOOL_HALLUCINATION_PREVENTION.md  # ✨ 工具幻觉防范指南
└── QUICK_START_TOOL_VALIDATION.md    # ✨ 本文件
```

---

## 🚀 使用方式

### 1. 当前已自动启用

验证器已经集成到 `api/lambda/chat.ts` 中,无需额外配置:

```typescript
// 在 executeToolCall 函数中自动调用
const validation = validateToolCall(toolCall);
if (!validation.valid) {
  // 自动返回错误信息给模型
  return { resultText: `<tool_error>...</tool_error>` };
}
```

### 2. 查看工具注册表

所有可用工具都在 `api/tools/toolValidator.ts` 中注册:

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
      examples: [...],
    },
  ],
]);
```

### 3. 查看生成的 System Prompt

启动服务后,查看日志中的 System Prompt:

```bash
npm run dev

# System Prompt 现在包含:
# - 动态生成的工具定义
# - 清晰的参数说明
# - 正例和反例示例
# - 明确的使用规则
```

---

## 🔍 验证示例

### ✅ 正确的工具调用

```typescript
// 模型输出
<tool_call>{"tool": "search_web", "query": "今天北京天气"}</tool_call>

// 验证结果
✅ 工具调用验证通过: search_web
{
  tool: 'search_web',
  query: '今天北京天气'
}
```

### ❌ 错误1: 工具不存在

```typescript
// 模型输出
<tool_call>{"tool": "calculator", "expression": "123+456"}</tool_call>

// 验证结果
❌ 工具调用验证失败: 工具 "calculator" 不存在
提示: 可用工具: search_web

// 返回给模型
<tool_error>
工具调用错误: 工具 "calculator" 不存在
提示: 可用工具: search_web
</tool_error>
```

### ❌ 错误2: 参数名错误

```typescript
// 模型输出
<tool_call>{"tool": "search_web", "keyword": "AI新闻"}</tool_call>

// 验证结果
❌ 工具调用验证失败: 缺少必填参数: query
提示: 正确格式: <tool_call>{"tool": "search_web", "query": "..."}</tool_call>
```

### ❌ 错误3: 参数类型错误

```typescript
// 模型输出
<tool_call>{"tool": "search_web", "query": "天气", "maxResults": "10"}</tool_call>

// 验证结果
❌ 工具调用验证失败: 参数 "maxResults" 类型错误
提示: 期望类型: number, 实际类型: string
```

---

## 🛠️ 添加新工具

### 步骤 1: 注册工具

编辑 `api/tools/toolValidator.ts`:

```typescript
export const TOOL_REGISTRY = new Map<string, ToolDefinition>([
  ['search_web', { ... }],
  
  // ✨ 添加新工具
  [
    'translator',
    {
      name: 'translator',
      description: '翻译文本',
      requiredParams: ['text', 'targetLanguage'],
      optionalParams: ['sourceLanguage'],
      paramTypes: {
        text: 'string',
        targetLanguage: 'string',
        sourceLanguage: 'string',
      },
      examples: [
        {
          input: '把"Hello"翻译成中文',
          toolCall: {
            tool: 'translator',
            text: 'Hello',
            targetLanguage: 'zh',
          },
        },
      ],
    },
  ],
]);
```

### 步骤 2: 实现工具函数

创建 `api/tools/translator.ts`:

```typescript
export async function translate(
  text: string,
  targetLanguage: string,
  sourceLanguage?: string
): Promise<string> {
  // 实现翻译逻辑
  // ...
  return translatedText;
}
```

### 步骤 3: 添加到 executeToolCall

编辑 `api/lambda/chat.ts`:

```typescript
async function executeToolCall(toolCall: any) {
  // ... 验证逻辑 ...
  
  const { tool } = normalizedToolCall;
  
  if (tool === 'search_web') {
    // 现有逻辑
  } else if (tool === 'translator') {
    // ✨ 新增分支
    const { text, targetLanguage, sourceLanguage } = normalizedToolCall;
    const result = await translate(text, targetLanguage, sourceLanguage);
    return {
      resultText: `<translation_result>${result}</translation_result>`,
    };
  }
}
```

### 步骤 4: 测试

```bash
npm run dev

# 测试对话
用户: "把 'Hello World' 翻译成中文"
AI: <tool_call>{"tool": "translator", "text": "Hello World", "targetLanguage": "zh"}</tool_call>
系统: ✅ 工具调用验证通过: translator
系统: 执行翻译...
AI: "翻译结果是: 你好世界"
```

---

## 📊 监控工具使用

### 查看日志

```bash
# 查看所有工具调用
grep "🔧 开始执行工具调用" logs/app.log

# 查看验证通过的调用
grep "✅ 工具调用验证通过" logs/app.log

# 查看验证失败的调用
grep "❌ 工具调用验证失败" logs/app.log
```

### 日志示例

```
✅ 工具调用验证通过: search_web { tool: 'search_web', query: '今天北京天气' }
🔍 执行搜索，查询: "今天北京天气"
✅ 搜索完成，结果数量: 5

❌ 工具调用验证失败: 工具 "calculator" 不存在
```

---

## 🧪 运行测试

```bash
# 如果你有测试框架(如 Jest)
npm test api/tools/__tests__/toolValidator.test.ts

# 测试覆盖的场景:
# ✅ 正确的工具调用
# ✅ 带可选参数的调用
# ❌ 不存在的工具
# ❌ 缺少必填参数
# ❌ 参数类型错误
# ⚠️ 移除多余参数
# 等等...
```

---

## ❓ 常见问题

### Q1: 为什么需要工具验证?

**A**: 当使用基于 Prompt 的工具调用时,模型可能会:
- 编造不存在的工具
- 传递错误的参数
- 混淆相似工具的用途

工具验证可以在执行前拦截这些错误,提高系统可靠性。

### Q2: 验证失败后会怎样?

**A**: 验证失败后:
1. 不会执行工具
2. 返回错误信息给模型: `<tool_error>...</tool_error>`
3. 模型看到错误后可以:
   - 重试(使用正确的工具)
   - 向用户道歉并说明原因

### Q3: 如何提高工具调用成功率?

**A**: 
1. ✅ 使用清晰的工具命名
2. ✅ 提供丰富的示例
3. ✅ 在 Prompt 中添加反例
4. ✅ 强调"只能使用列出的工具"
5. ✅ 收集失败案例并优化 Prompt

详见: [工具幻觉防范指南](./TOOL_HALLUCINATION_PREVENTION.md)

### Q4: 工具数量有限制吗?

**A**: 
- 1-3 个工具: ✅ 安全,成功率 >90%
- 4-8 个工具: ⚠️ 需要优化 Prompt
- 9-15 个工具: ⚠️ 建议引入工具路由
- 16+ 个工具: ❌ 需要架构升级(如原生 Function Calling)

### Q5: 如何切换到原生 Function Calling?

**A**: 
当使用支持原生 Function Calling 的模型(如 GPT-4, Claude 3.5)时:
1. 在 `callModel` 函数中检测模型能力
2. 如果支持,传递 `tools` 参数而不是在 System Prompt 中定义
3. 处理模型返回的 `tool_calls` 字段

详见: [工具调用实现总结](./TOOL_CALLING_IMPLEMENTATION.md) 的"主流方案对比"章节

---

## 🎓 学习资源

### 项目文档
- [工具幻觉防范指南](./TOOL_HALLUCINATION_PREVENTION.md) - 深入了解工具幻觉问题
- [工具调用实现总结](./TOOL_CALLING_IMPLEMENTATION.md) - 完整的技术文档

### 代码文件
- `api/tools/toolValidator.ts` - 工具验证器源码
- `api/lambda/chat.ts` - 集成示例
- `api/tools/__tests__/toolValidator.test.ts` - 测试用例

---

## ✨ 核心优势

| 优势 | 说明 |
|-----|------|
| 🛡️ 防止工具幻觉 | 拦截不存在的工具调用 |
| ✅ 类型安全 | 自动验证参数类型 |
| 🎯 智能提示 | 提供友好的错误信息和建议 |
| 🔧 易于扩展 | 添加新工具只需 3 步 |
| 📊 可观测性 | 详细的日志和监控 |
| 🚀 零配置 | 已集成,无需额外设置 |

---

## 🤝 反馈和改进

如果你遇到任何问题或有改进建议,请:

1. 查看日志中的错误信息
2. 检查工具注册表是否正确
3. 参考 [工具幻觉防范指南](./TOOL_HALLUCINATION_PREVENTION.md)
4. 联系开发团队

---

**文档版本**: v1.0  
**最后更新**: 2025-11-26  
**作者**: AI Agent 开发团队

祝你使用愉快! 🎉

