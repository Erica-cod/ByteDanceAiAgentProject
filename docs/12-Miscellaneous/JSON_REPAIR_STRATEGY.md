# JSON 修复策略

## 概述

JSON 的正确解析对项目的正常运行**非常重要**，因此我们采用**双重保险**的修复策略。

---

## 修复策略

### 🥇 策略 1：jsonrepair 包（主要方案）

**优先使用成熟的第三方库** - [jsonrepair](https://www.npmjs.com/package/jsonrepair)

```typescript
import { jsonrepair } from 'jsonrepair';

try {
  const repairedJsonStr = jsonrepair(brokenJson);
  const result = JSON.parse(repairedJsonStr);
  console.log('✅ JSON 修复成功（jsonrepair）');
  return result;
} catch (error) {
  // 失败后尝试备用方案
}
```

**优点**：
- ✅ 成熟稳定，经过大量测试
- ✅ 处理各种边界情况
- ✅ 持续维护和更新
- ✅ 社区验证

---

### 🥈 策略 2：自定义修复逻辑（备用方案）

**当 jsonrepair 失败时，使用自定义逻辑**

```typescript
try {
  const fixedJsonStr = fixCommonJSONErrors(brokenJson);
  const result = JSON.parse(fixedJsonStr);
  console.log('✅ JSON 修复成功（自定义逻辑）');
  return result;
} catch (error) {
  // 所有修复策略都失败
  console.error('❌ JSON 无法修复');
}
```

**修复内容**：
- 移除 BOM 和零宽字符
- 移除单行/多行注释
- 修复尾随逗号
- 修复未闭合的字符串
- 修复未闭合的对象/数组
- 转义未转义的引号

**优点**：
- ✅ 针对项目特定问题定制
- ✅ 作为最后的保险
- ✅ 不依赖外部服务

---

## 实施位置

### 1. `api/utils/jsonExtractor.ts`

**核心提取函数** - `extractJSON()`

```typescript
// 尝试直接解析
try {
  const result = JSON.parse(jsonStr);
  return result;
} catch (parseError) {
  // 🔧 修复策略 1: jsonrepair 包
  try {
    const repairedJsonStr = jsonrepair(jsonStr);
    const result = JSON.parse(repairedJsonStr);
    console.log('✅ JSON 修复成功（jsonrepair）');
    return result;
  } catch (repairError) {
    // 🔧 修复策略 2: 自定义逻辑
    try {
      const fixedJsonStr = fixCommonJSONErrors(jsonStr);
      const result = JSON.parse(fixedJsonStr);
      console.log('✅ JSON 修复成功（自定义）');
      return result;
    } catch (fixError) {
      console.error('❌ 所有修复策略都失败');
    }
  }
}
```

**辅助函数** - `extractJSONWithRemainder()`

同样采用双重修复策略。

---

## 使用示例

### 示例 1：提取工具调用

```typescript
import { extractToolCall } from './utils/jsonExtractor';

const aiResponse = `
我来帮你搜索
<tool_call>
{
  "name": "tavily_search",
  "args": {
    "query": "最新 AI 新闻",  // 注释会被自动移除
  }  // 尾随逗号会被自动修复
}
</tool_call>
`;

const toolCall = extractToolCall(aiResponse);
// ✅ 自动修复并解析成功
// toolCall = { name: 'tavily_search', args: { query: '最新 AI 新闻' } }
```

### 示例 2：提取计划数据

```typescript
import { extractJSON } from './utils/jsonExtractor';

const aiResponse = `
这是你的学习计划：
```json
{
  "title": "Python 学习计划",
  "tasks": [
    { "name": "基础语法", "hours": 10 },
    { "name": "数据结构", "hours": 20 }  // 尾随逗号
  ]  // 尾随逗号
}
```
`;

const plan = extractJSON(aiResponse);
// ✅ 自动修复并解析成功
```

---

## 修复成功率

### jsonrepair 包

- ✅ 处理大部分常见错误
- ✅ 处理复杂的嵌套结构
- ✅ 处理 Unicode 字符
- ✅ 处理科学计数法
- ✅ 处理特殊转义

### 自定义逻辑

- ✅ 处理项目特定的 AI 输出格式
- ✅ 处理注释（AI 经常添加注释）
- ✅ 处理尾随逗号（AI 经常忘记删除）
- ✅ 处理未闭合的结构

### 组合效果

**双重保险 = 更高的成功率** 🎯

---

## 日志输出

修复过程会输出详细日志，便于调试：

```
🔍 [JSONExtractor] 开始提取 JSON...
🔍 [JSONExtractor] 文本长度: 245 字符
✓ 策略1: 匹配 Markdown 代码块
📝 提取的 JSON 长度: 180 字符
⚠️  JSON 解析失败: Unexpected token '/' at position 45
尝试自动修复...
✅ JSON 修复成功（使用 jsonrepair 包，策略: Markdown代码块）
```

---

## 为什么需要双重保险？

### 1. AI 输出不可预测

AI 可能输出：
- 带注释的 JSON
- 尾随逗号
- 未闭合的结构
- 混合的格式

### 2. 项目依赖 JSON 解析

- ✅ 工具调用（tool_call）
- ✅ 计划数据（plan）
- ✅ 多 Agent 通信
- ✅ 配置数据

**任何一个解析失败都会影响功能！**

### 3. 成熟库 + 自定义 = 最佳组合

- jsonrepair：处理通用问题
- 自定义逻辑：处理项目特定问题
- **组合使用 = 最高成功率**

---

## 性能影响

### jsonrepair 包

- ⚡ 性能优秀（C++ 实现）
- ⚡ 只在解析失败时调用
- ⚡ 通常在 1-5ms 内完成

### 自定义逻辑

- ⚡ 简单的字符串替换
- ⚡ 只在 jsonrepair 失败时调用
- ⚡ 通常在 1ms 内完成

**总体性能影响：可忽略不计**

---

## 维护建议

### 1. 监控修复率

定期检查日志，统计：
- 直接解析成功率
- jsonrepair 修复成功率
- 自定义逻辑修复成功率
- 完全失败率

### 2. 优化自定义逻辑

根据实际失败案例，持续优化 `fixCommonJSONErrors()` 函数。

### 3. 更新 jsonrepair

定期更新 jsonrepair 包，获取最新的修复能力。

```bash
npm update jsonrepair
```

---

## 总结

✅ **双重保险策略**：
1. 优先使用成熟的 jsonrepair 包
2. 失败后使用自定义修复逻辑
3. 确保 JSON 解析的高成功率

✅ **关键优势**：
- 更高的容错性
- 更好的稳定性
- 更少的运行时错误
- 更好的用户体验

✅ **适用场景**：
- AI 工具调用
- 计划数据提取
- 配置数据解析
- 任何需要解析 AI 输出的场景

**JSON 解析是项目的关键，双重保险确保万无一失！** 🎯

