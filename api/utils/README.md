# Utils 目录 - Shared Utilities（共享工具函数）

## 📍 架构定位

**Utils** 是 Clean Architecture 的 **Shared Utilities（共享工具层）**，包含无业务逻辑的纯工具函数。

```
┌─────────────────────────────────────────────────────────────┐
│                    Shared Utilities Layer                    │
│                        (api/utils/)                          │
│   SSEStreamWriter, TextChunker, etc.                         │
└───────────────────────┬─────────────────────────────────────┘
                        │ 被所有层使用
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌────────────┐  ┌────────────┐  ┌────────────┐
│Presentation│  │Application │  │Infrastructure│
│   Layer    │  │   Layer    │  │    Layer     │
│ (handlers) │  │(use-cases) │  │(repositories)│
└────────────┘  └────────────┘  └────────────┘
```

## 🎯 职责

### ✅ Utils 的职责（应该做什么）
- 提供纯工具函数（无副作用）
- 处理通用的技术性问题（非业务逻辑）
- 提高代码复用性
- 保持职责单一

### ❌ Utils 不应该包含
- ❌ 业务逻辑
- ❌ 数据库访问
- ❌ 依赖具体的业务实体

## 📂 文件说明

### `sseStreamWriter.ts` - SSE 流式写入工具类

**作用**：封装 SSE 流式响应的通用逻辑

**特点**：
- ✅ 无业务逻辑，纯技术工具
- ✅ 可被任何层使用
- ✅ 职责单一（只负责 SSE 流的写入）

**功能**：
- 安全写入（处理客户端断开）
- 心跳机制（keep-alive）
- 错误处理
- 流状态管理

**使用示例**：
```typescript
// 在 Presentation Layer 使用
// api/lambda/chat.ts
import { SSEStreamWriter } from '../utils/sseStreamWriter.js';

const { readable, writable } = new TransformStream();
const writer = writable.getWriter();
const sseWriter = new SSEStreamWriter(writer);

await sseWriter.sendEvent({ content: 'Hello' });
await sseWriter.startHeartbeat(15000);
await sseWriter.close();
```

```typescript
// 在 Application Layer 使用
// api/_clean/application/use-cases/text-analysis/process-long-text-analysis.use-case.ts
import { SSEStreamWriter } from '../../../../utils/sseStreamWriter.js';

export class ProcessLongTextAnalysisUseCase {
  async execute(
    sseWriter: SSEStreamWriter,  // ← 接收工具类实例
    // ...
  ) {
    await sseWriter.sendEvent({ type: 'progress', value: 50 });
  }
}
```

---

### `textChunker.ts` - 文本智能切分工具

**作用**：将超长文本智能切分成多个 chunks（用于 Map-Reduce 处理）

**特点**：
- ✅ 算法级工具（文本处理算法）
- ✅ 无业务逻辑
- ✅ 可独立测试

**功能**：
- 智能切分点检测（段落边界、句子边界）
- 重叠区域处理（避免上下文丢失）
- 大小控制（目标大小、最大大小）

**使用示例**：
```typescript
// 在 Application Layer 使用
// api/_clean/application/use-cases/text-analysis/process-long-text-analysis.use-case.ts
import { splitTextIntoChunks } from '../../../../utils/textChunker.js';

const chunks = splitTextIntoChunks(longText, {
  maxChunks: 30,
  targetChunkSize: 6000,
  overlapSize: 300,
});

// 返回结构：
// [
//   { index: 0, content: '...', startChar: 0, endChar: 6000, hasOverlap: true },
//   { index: 1, content: '...', startChar: 5700, endChar: 11700, hasOverlap: true },
//   ...
// ]
```

## 🔗 与 Clean Architecture 的协作

### 协作模式：依赖注入或直接导入

#### 模式 1：直接导入（适用于纯函数）
```typescript
// 纯函数工具：直接导入使用
import { splitTextIntoChunks } from '../utils/textChunker.js';

const chunks = splitTextIntoChunks(text, options);
```

#### 模式 2：依赖注入（适用于有状态的工具类）
```typescript
// 有状态的工具类：通过参数传递
async function execute(
  sseWriter: SSEStreamWriter,  // ← 外部创建并注入
  // ...
) {
  await sseWriter.sendEvent({ type: 'progress' });
}
```

## 🚫 为什么不迁移到 `_clean/`？

### 原因 1：工具函数是跨层的
Utils 中的函数被 **所有层** 使用（Presentation、Application、Infrastructure），放在独立的 `utils/` 目录更合理。

### 原因 2：无业务逻辑
- `SSEStreamWriter` 只处理 SSE 协议（技术问题）
- `textChunker` 只处理文本切分算法（算法问题）
- 它们不包含任何业务规则

### 原因 3：职责分离
```
api/_clean/          ← 业务逻辑（Domain, Application, Infrastructure）
api/utils/           ← 技术工具（纯函数、算法、协议处理）
```

### 原因 4：Clean Architecture 的灵活性
Clean Architecture 的核心是 **依赖规则**（内层不依赖外层），而不是 **文件组织形式**。

只要满足：
- ✅ 无业务逻辑
- ✅ 不依赖具体业务实体
- ✅ 可被任何层使用

这些工具函数放在独立的 `utils/` 目录是**完全符合**Clean Architecture 的。

## 📚 Clean Architecture 与工具函数

### Uncle Bob 的观点

> "工具函数和帮助类可以放在任何地方，只要它们不违反依赖规则。通常，我们会将它们放在一个独立的 Shared 或 Utils 层。"

### 典型的项目结构

```
src/
├── core/              ← Clean Architecture 核心
│   ├── domain/
│   ├── application/
│   └── infrastructure/
│
├── utils/             ← 共享工具（被 core 使用）
│   ├── text/
│   ├── stream/
│   └── validation/
│
└── types/             ← 共享类型（被 core 使用）
```

## 🎯 最佳实践

### ✅ 应该放在 `api/utils/` 的内容
- 纯函数工具（无副作用）
- 算法实现（排序、搜索、切分等）
- 协议处理（HTTP、SSE、WebSocket等）
- 格式转换（JSON、XML、CSV等）
- 字符串处理、日期处理、数学计算

### ❌ 不应该放在 `api/utils/` 的内容
- 业务逻辑（应该在 Use Cases）
- 数据访问（应该在 Repositories）
- 业务规则验证（应该在 Domain Entities）
- 依赖具体业务实体的代码

## 📊 当前 Utils 分析

| 文件 | 职责 | 是否符合 | 说明 |
|------|------|----------|------|
| `sseStreamWriter.ts` | SSE 协议处理 | ✅ | 纯技术工具，无业务逻辑 |
| `textChunker.ts` | 文本切分算法 | ✅ | 纯算法，无业务逻辑 |

## 🔄 与 `_clean/shared/utils/` 的区别

你可能注意到 `api/_clean/shared/utils/` 也有一些工具函数。区别在于：

### `api/utils/` （外层工具）
- 通用技术工具
- 可被任何项目复用
- 与业务完全无关

### `api/_clean/shared/utils/` （内层工具）
- 与业务领域相关的工具
- 例如：`json-extractor.js`（提取工具调用）、`content-extractor.js`（提取思考内容）
- 虽然是工具，但与 AI 对话的业务领域相关

## 🎉 结论

**Utils 不需要迁移，它们是 Clean Architecture 的共享工具层！**

这种设计：
- ✅ 符合 Clean Architecture 的依赖规则
- ✅ 职责清晰（技术工具 vs 业务逻辑）
- ✅ 高复用性
- ✅ 易于测试和维护

---

## 📖 扩展阅读

如果你想深入了解 Clean Architecture 中的工具层设计，推荐阅读：
- Robert C. Martin 的《Clean Architecture》第三部分
- Martin Fowler 的《Refactoring》关于提取公共代码的章节

