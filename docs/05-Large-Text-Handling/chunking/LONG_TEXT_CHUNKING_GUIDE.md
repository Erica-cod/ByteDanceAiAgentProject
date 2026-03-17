# 超长文本智能分段处理（Chunking）功能指南

## 📋 功能概述

当用户输入超长文本（如详细的项目计划、长篇文档等）时，系统会自动启用智能分段处理（Chunking）模式，将文本切分成多个片段分别分析，最后合并生成完整的评审报告。

## 🎯 适用场景

- **项目计划评审**：超长的项目计划文档（>5000 字符或 >300 行）
- **文档摘要**：需要提取关键信息的长篇文档
- **多任务清单**：包含大量任务的待办事项列表

## 🚀 使用方式

### 自动触发

系统会根据文本长度自动判断是否启用 Chunking：

| 阈值类型 | 字符数 | 行数 | 行为 |
|---------|--------|------|------|
| **软提示** | ≥ 5,000 | ≥ 300 | 显示黄色警告，建议使用 chunking |
| **强提示** | ≥ 12,000 | ≥ 1,000 | 显示红色警告，自动启用 chunking |

### 前端 UI 提示

输入框下方会显示实时统计：

```
📊 12,345 字符 · 567 行
⚠️ 文本过长（12,345 字符），建议使用智能分段处理
```

## 🔧 技术实现

### 整体流程（Map-Reduce）

```
用户输入超长文本
    ↓
1. Split（切分）
   - 按语义结构切分（空行、标题、列表等）
   - 目标大小：6000-8000 字符/段
   - 添加 overlap（300 字符）避免信息丢失
    ↓
2. Map（分段分析）
   - 每个 chunk 独立调用 AI 模型
   - 提取结构化信息：目标、任务、里程碑、风险等
   - 输出 JSON 格式
    ↓
3. Reduce（合并）
   - 代码层面去重和归一化
   - 合并所有 chunk 的提取结果
    ↓
4. Final（最终评审）
   - 基于合并后的数据生成评审报告
   - 流式输出给用户
```

### 前端实现

#### 1. 文本检测工具（`src/utils/textUtils.ts`）

```typescript
export function isLongText(text: string): {
  isLong: boolean;
  level: 'none' | 'soft' | 'hard';
  stats: TextStats;
  reason?: string;
}
```

#### 2. 统计指示器组件（`src/components/TextStatsIndicator.tsx`）

实时显示字符数、行数，并在超长时显示警告。

#### 3. SSE 事件处理（`src/hooks/data/useSSEStream.ts`）

处理 chunking 相关的 SSE 事件：

- `chunking_init`：初始化，显示总段数
- `chunking_progress`：进度更新（split/map/reduce/final）
- `chunking_chunk`：单个 chunk 完成

### 后端实现

#### 1. 文本切分器（`api/utils/textChunker.ts`）

```typescript
export function splitTextIntoChunks(
  text: string, 
  options: ChunkOptions
): TextChunk[]
```

**切分策略**：
- 优先按语义结构（空行、标题、列表）
- 单段超长则按句号/分号硬切
- 添加 overlap 避免跨段信息丢失
- 保护性上限：最多 30 段

#### 2. Chunking 服务（`api/services/chunkingPlanReviewService.ts`）

核心处理逻辑：

```typescript
export async function handleChunkingPlanReview(
  message: string,
  userId: string,
  conversationId: string,
  clientAssistantMessageId: string | undefined,
  modelType: 'local' | 'volcano',
  sseWriter: SSEStreamWriter,
  options: ChunkingOptions
): Promise<void>
```

#### 3. Prompt 模板（`api/config/chunkingPrompts.ts`）

- **Map Prompt**：提取单个 chunk 的结构化信息
- **Reduce Prompt**：基于合并数据生成最终评审

#### 4. API 集成（`api/lambda/chat.ts`）

在主 chat API 中添加 chunking 分支：

```typescript
if (shouldUseChunking) {
  // 创建 SSE 流
  // 执行 chunking 处理
  // 返回流式响应
}
```

## 📊 SSE 事件协议

### 初始化事件

```json
{
  "type": "chunking_init",
  "totalChunks": 15,
  "estimatedSeconds": 75
}
```

### 进度事件

```json
{
  "type": "chunking_progress",
  "stage": "map",
  "chunkIndex": 3,
  "totalChunks": 15
}
```

**stage 类型**：
- `split`：正在切分文本
- `map`：正在分析第 N 段
- `reduce`：正在合并结果
- `final`：正在生成最终报告

### Chunk 完成事件

```json
{
  "type": "chunking_chunk",
  "chunkIndex": 3,
  "chunkSummary": "目标1; 目标2; 目标3"
}
```

### 内容事件（最终输出）

```json
{
  "content": "## 📋 计划概览\n...",
  "thinking": "正在生成评审报告..."
}
```

## 🎨 用户体验

### 输入阶段

1. 用户粘贴超长文本
2. 输入框自动撑开（最大 200px）
3. 下方显示实时统计和警告

### 处理阶段

```
检测到超长文本，将分 15 段智能处理...
  ↓
正在分析第 1/15 段...
正在分析第 2/15 段...
...
  ↓
正在合并分析结果...
  ↓
正在生成最终评审报告...
  ↓
[流式输出最终内容]
```

### 输出结果

生成的评审报告包含：

1. **📋 计划概览**：目标、里程碑、任务、指标统计
2. **⚠️ 主要问题与风险**：可执行性、时间安排、指标、风险分析
3. **💡 改进建议**：按优先级排序的具体建议
4. **✅ 优化后的计划骨架**：改进后的结构
5. **❓ 需要澄清的问题**：需要确认的关键问题

## ⚙️ 配置参数

### 前端配置（`src/utils/textUtils.ts`）

```typescript
export const LONG_TEXT_THRESHOLDS = {
  SOFT: { chars: 5000, lines: 300 },
  HARD: { chars: 12000, lines: 1000 },
};
```

### 后端配置（`api/utils/textChunker.ts`）

```typescript
const DEFAULT_OPTIONS = {
  targetChunkSize: 6000,   // 目标 chunk 大小
  maxChunkSize: 8000,      // 最大 chunk 大小
  overlapSize: 300,        // 重叠大小
  maxChunks: 30,           // 最大 chunk 数量
};
```

## 🧪 测试

运行 Jest 集成测试（可选）：

```bash
# 需要服务端运行
npm run dev

# 另一个终端运行（脚本会自动打开 RUN_CHUNKING_TEST=1）
npm run test:chunking
```

测试脚本会：
1. 生成一个超长的项目计划文本（~15,000 字符）
2. 发送到 `/api/chat` 接口
3. 实时显示 chunking 进度
4. 输出最终评审报告

## 🔒 资源保护

### 并发控制

- 复用现有的 `sseLimiter`（每用户 1 个并发连接）
- Chunking 只占用一条 SSE 连接

### 时长保护

- 单个 chunk 处理超时：30 秒
- 总处理时长上限：120 秒（可配置）
- 超时自动降级或提示用户精简

### 可中止

- 用户点击"停止"按钮断开 SSE
- 后端检测到断开立即停止后续 chunk 处理

## 📈 性能优化

### 切分优化

- 优先按语义结构切分（保持内容完整性）
- 添加 overlap 减少跨段信息丢失
- 单段超长自动硬切（避免单次调用超时）

### 并发优化（未来）

- 当前：串行处理每个 chunk
- 未来：可并发处理多个 chunk（需要控制并发数）

### 缓存优化（未来）

- 相同文本的 chunk 结果可缓存
- 避免重复分析

## 🐛 已知限制

1. **模型调用成本**：30 个 chunk 可能产生较高的 API 调用成本
2. **处理时长**：超长文本可能需要 60-120 秒
3. **JSON 解析**：Map 阶段依赖模型输出 JSON，可能失败（已有降级处理）

## 🚀 未来优化

1. **智能模式选择**：根据文本类型自动选择处理模式（计划评审/摘要/问答）
2. **增量处理**：支持用户修改部分内容后只重新处理变更的 chunk
3. **可视化进度**：显示更详细的进度条和每个 chunk 的状态
4. **引用片段**：在最终报告中引用原文片段（chunk 编号 + 行号）

## 📚 相关文档

- [超长计划文本 Chunking + 合并方案](../超长计划文本chunking_sse_6825ac65.plan.md)
- [SSE 连接守护](./SSE_CONNECTION_GUARD.md)
- [多 Agent 协作模式](./STREAMING_MULTI_AGENT_GUIDE.md)

