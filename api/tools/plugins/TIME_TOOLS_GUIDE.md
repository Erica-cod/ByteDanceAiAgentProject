# 🕐 时间工具迁移指南

## 📋 迁移概述

时间工具已成功从 `api/tools/plugins/timeTools.ts` 迁移到 v2 插件系统，提供了 4 个独立的时间工具插件。

---

## 🔧 新增的 4 个工具

### 1. `get_current_time` - 获取当前时间

**功能：** 获取当前日期、时间、星期等信息

**参数：**
```typescript
{
  timezone?: string;      // 时区（默认 "Asia/Shanghai"）
  format?: 'iso' | 'chinese' | 'both';  // 返回格式
}
```

**使用示例：**
```typescript
// 通过 Function Calling
{
  name: 'get_current_time',
  arguments: {
    timezone: 'Asia/Shanghai',
    format: 'both'
  }
}
```

**返回结果：**
```json
{
  "success": true,
  "data": {
    "now": "2025-01-02T10:30:00",
    "timezone": "Asia/Shanghai",
    "weekday": "Thursday",
    "date": "2025-01-02",
    "time": "10:30:00",
    "timestamp": 1735791000000,
    "chinese": "2025年1月2日 星期四",
    "display": "📅 2025-01-02 Thursday\n⏰ 10:30:00\n中文格式: 2025年1月2日 星期四"
  },
  "message": "当前时间: 📅 2025-01-02 Thursday..."
}
```

---

### 2. `calculate_date` - 日期计算

**功能：** 根据偏移量计算新日期（加减年月日等）

**参数：**
```typescript
{
  base_date?: string;     // 基准日期（留空则为当前时间）
  years?: number;         // 年数偏移
  months?: number;        // 月数偏移
  weeks?: number;         // 周数偏移
  days?: number;          // 天数偏移
  hours?: number;         // 小时偏移
  minutes?: number;       // 分钟偏移
  workdays?: number;      // 工作日偏移（只计算周一到周五）
}
```

**使用示例：**
```typescript
// 示例1：3天后
{
  name: 'calculate_date',
  arguments: {
    days: 3
  }
}

// 示例2：从指定日期往前推2周
{
  name: 'calculate_date',
  arguments: {
    base_date: '2025-12-25',
    weeks: -2
  }
}

// 示例3：5个工作日后
{
  name: 'calculate_date',
  arguments: {
    workdays: 5
  }
}
```

**返回结果：**
```json
{
  "success": true,
  "data": {
    "result_date": "2025-01-05",
    "weekday": "Sunday",
    "iso_string": "2025-01-05T10:30:00.000Z",
    "timestamp": 1736077800000,
    "chinese": "2025年1月5日 星期日",
    "relative": "3天后",
    "is_workday": false
  },
  "message": "计算结果: 2025年1月5日 星期日 (3天后)"
}
```

---

### 3. `parse_natural_date` - 解析自然语言日期

**功能：** 将自然语言描述转换为具体日期

**参数：**
```typescript
{
  description: string;    // 自然语言描述（必需）
  base_date?: string;     // 基准日期（可选）
}
```

**支持的自然语言格式：**
- **绝对时间：** 今天、明天、后天、昨天
- **相对天数：** 3天后、5天前
- **相对周数：** 2周后、1周前、下周
- **相对月份：** 下个月、3个月后
- **具体星期：** 下周一、下周五
- **相对年份：** 明年

**使用示例：**
```typescript
// 示例1：明天
{
  name: 'parse_natural_date',
  arguments: {
    description: '明天'
  }
}

// 示例2：下周一
{
  name: 'parse_natural_date',
  arguments: {
    description: '下周一'
  }
}

// 示例3：3天后
{
  name: 'parse_natural_date',
  arguments: {
    description: '3天后'
  }
}
```

**返回结果：**
```json
{
  "success": true,
  "data": {
    "result_date": "2025-01-06",
    "weekday": "Monday",
    "iso_string": "2025-01-06T00:00:00.000Z",
    "timestamp": 1736121600000,
    "chinese": "2025年1月6日 星期一",
    "relative": "4天后",
    "is_workday": true,
    "original_description": "下周一"
  },
  "message": "\"下周一\" = 2025年1月6日 星期一 (4天后)"
}
```

---

### 4. `compare_dates` - 日期比较

**功能：** 计算两个日期之间的差距

**参数：**
```typescript
{
  date1: string;          // 第一个日期（必需）
  date2?: string;         // 第二个日期（留空则为当前日期）
}
```

**使用示例：**
```typescript
// 示例1：距离今天还有多少天
{
  name: 'compare_dates',
  arguments: {
    date1: '2025-12-25'
  }
}

// 示例2：两个日期相差多少天
{
  name: 'compare_dates',
  arguments: {
    date1: '2025-01-01',
    date2: '2025-12-31'
  }
}
```

**返回结果：**
```json
{
  "success": true,
  "data": {
    "date1": "2025-12-25",
    "date2": "2025-01-02",
    "days_between": -357,
    "abs_days": 357,
    "weeks": 51,
    "months": 11,
    "comparison": "date2 在 date1 之前 357 天"
  },
  "message": "date2 在 date1 之前 357 天（约 51 周或 11 个月）"
}
```

---

## 🚀 快速开始

### 1. 初始化工具系统

```typescript
import { initializeToolSystem } from './api/tools/v2/index.js';

// 初始化（会自动注册所有时间工具）
initializeToolSystem();
```

### 2. 获取工具 Schema（传给 AI）

```typescript
import { toolRegistry } from './api/tools/v2/index.js';

// 获取所有工具的 Function Calling Schema
const tools = toolRegistry.getAllSchemas();

// 传递给 OpenAI
const response = await openai.chat.completions.create({
  model: 'gpt-4-turbo',
  messages: messages,
  tools: tools,  // 包含所有时间工具
  tool_choice: 'auto',
});
```

### 3. 执行工具

```typescript
import { toolExecutor } from './api/tools/v2/index.js';

// AI 返回了工具调用
const toolCalls = response.choices[0].message.tool_calls;

for (const toolCall of toolCalls) {
  const toolName = toolCall.function.name;
  const params = JSON.parse(toolCall.function.arguments);
  
  // 执行工具
  const result = await toolExecutor.execute(toolName, params, {
    userId: userId,
    requestId: generateRequestId(),
    timestamp: Date.now(),
  });
  
  console.log('工具执行结果:', result);
}
```

---

## 📊 性能配置

### 限流配置

所有时间工具使用相同的限流配置：
```typescript
{
  maxConcurrent: 200,      // 最多 200 个并发
  maxPerMinute: 2000,      // 每分钟最多 2000 次
  timeout: 1000            // 超时 1 秒
}
```

### 缓存配置

| 工具 | 缓存 | TTL | 说明 |
|------|------|-----|------|
| `get_current_time` | ✅ | 10秒 | 时间变化频繁，短缓存 |
| `calculate_date` | ✅ | 5分钟 | 计算结果稳定 |
| `parse_natural_date` | ✅ | 1分钟 | 相对时间变化快 |
| `compare_dates` | ✅ | 5分钟 | 计算结果稳定 |

### 熔断器配置

时间工具是**本地计算**，不依赖外部 API，所以：
- ✅ **不启用熔断器**
- ✅ **高可用性**
- ✅ **低延迟**（< 10ms）

---

## 🔄 从旧 API 迁移

### 旧方式（直接调用函数）

```typescript
// ❌ 旧代码
import { getNow, calculateDate } from './api/tools/plugins/timeTools.js';

const now = getNow('Asia/Shanghai');
const futureDate = calculateDate(new Date(), { days: 3 });
```

### 新方式（通过工具系统）

```typescript
// ✅ 新代码
import { toolExecutor } from './api/tools/v2/index.js';

// 获取当前时间
const nowResult = await toolExecutor.execute('get_current_time', {
  timezone: 'Asia/Shanghai',
}, context);

// 计算日期
const dateResult = await toolExecutor.execute('calculate_date', {
  days: 3,
}, context);
```

### 兼容性说明

**旧的 `timeTools.ts` 仍然保留**，可以继续使用！

新插件是对旧函数的**封装**，底层调用的还是原来的函数，只是增加了：
- ✅ 统一的接口
- ✅ 限流保护
- ✅ 缓存加速
- ✅ 指标监控
- ✅ Function Calling 支持

---

## 💡 实际使用场景

### 场景 1：用户问"明天几号？"

```typescript
// AI 调用工具
{
  name: 'parse_natural_date',
  arguments: { description: '明天' }
}

// 返回结果
{
  success: true,
  data: {
    result_date: '2025-01-03',
    chinese: '2025年1月3日 星期五',
    relative: '明天'
  }
}

// AI 回复用户
"明天是 2025年1月3日 星期五"
```

### 场景 2：用户问"3个工作日后是哪天？"

```typescript
// AI 调用工具
{
  name: 'calculate_date',
  arguments: { workdays: 3 }
}

// 返回结果
{
  success: true,
  data: {
    result_date: '2025-01-07',
    chinese: '2025年1月7日 星期二',
    is_workday: true
  }
}
```

### 场景 3：用户问"距离春节还有多少天？"

```typescript
// AI 调用工具
{
  name: 'compare_dates',
  arguments: {
    date1: '2025-01-29'  // 2025年春节
  }
}

// 返回结果
{
  success: true,
  data: {
    days_between: 27,
    weeks: 3,
    comparison: 'date2 在 date1 之前 27 天'
  }
}
```

---

## 🎯 优势总结

### vs 旧方式

| 特性 | 旧方式 | V2 插件方式 |
|------|--------|-------------|
| **接口统一** | ❌ 不同函数不同参数 | ✅ 统一的 execute 接口 |
| **限流保护** | ❌ 无 | ✅ 200 并发限制 |
| **缓存加速** | ❌ 无 | ✅ 智能缓存 |
| **指标监控** | ❌ 无 | ✅ 实时指标 |
| **Function Calling** | ❌ 不支持 | ✅ 原生支持 |
| **错误处理** | ❌ 需要自己处理 | ✅ 统一错误格式 |
| **可扩展性** | ❌ 难以扩展 | ✅ 插件式架构 |

---

## 📚 相关文档

- [工具系统 V2 设计文档](../README.md)
- [实现总结](../IMPLEMENTATION_SUMMARY.md)
- [迁移指南](../MIGRATION_GUIDE.md)
- [原始时间工具代码](../../timeTools.ts)

---

## ✅ 检查清单

迁移完成后，请检查：

- [ ] `initializeToolSystem()` 在启动时被调用
- [ ] 时间工具在 `toolRegistry.getAllNames()` 中能找到
- [ ] AI 能正确调用时间工具（通过 Function Calling）
- [ ] 时间工具执行成功，返回正确结果
- [ ] 缓存正常工作（相同查询返回缓存结果）
- [ ] 指标正常收集（可通过 `toolExecutor.getMetrics()` 查看）

---

## 🆘 常见问题

### Q1: 为什么要迁移到插件系统？

**A:** 插件系统提供了：
1. **统一接口**：所有工具使用相同的调用方式
2. **保护机制**：限流、缓存、熔断
3. **Function Calling 支持**：AI 可以直接调用
4. **可观测性**：实时监控和指标

### Q2: 旧代码还能用吗？

**A:** 可以！`timeTools.ts` 仍然保留，你可以：
- 继续在内部代码中直接调用
- 新功能使用插件方式
- 逐步迁移旧代码

### Q3: 性能有影响吗？

**A:** 几乎没有！
- 时间工具是本地计算，< 10ms
- 加上缓存，二次调用 < 1ms
- 限流和指标收集开销可忽略

### Q4: 如何查看时间工具的使用情况？

**A:** 使用监控 API：
```typescript
import { toolExecutor } from './api/tools/v2/index.js';

// 查看指定工具的指标
const metrics = toolExecutor.getMetrics('get_current_time');
console.log(metrics);
// {
//   name: 'get_current_time',
//   status: 'healthy',
//   totalCalls: 150,
//   successCalls: 150,
//   cacheHitRate: '60%',
//   averageLatency: 5
// }
```

---

## 🎉 迁移完成！

恭喜！时间工具已成功迁移到 V2 插件系统。

现在你可以：
- ✅ 通过 Function Calling 让 AI 调用时间工具
- ✅ 享受限流、缓存、监控等保护机制
- ✅ 继续使用原来的 `timeTools.ts` 函数
- ✅ 用插件方式快速添加新的时间工具

有问题？查看 [完整文档](../README.md) 或联系团队！

