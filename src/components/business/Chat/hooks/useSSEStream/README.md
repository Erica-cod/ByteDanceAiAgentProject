# useSSEStream - 模块化架构

## 📁 文件结构

```
useSSEStream/
├── index.ts                    # 主入口，导出 useSSEStream hook
├── types.ts                    # TypeScript 类型定义
├── raf-batching.ts             # RAF 批处理优化逻辑
├── upload.ts                   # 上传相关逻辑（直接、压缩、分片）
├── multi-agent-handlers.ts     # 多 Agent 模式事件处理器
├── chunking-handlers.ts        # Chunking 模式事件处理器
└── README.md                   # 本文件
```

## 🎯 设计目标

将原来 990 行的单一文件拆分为多个职责清晰的模块，提高代码可维护性和可测试性。

## 📚 模块说明

### 1. `index.ts` - 主入口 (~380 行)

**职责**：
- 导出 `useSSEStream` Hook
- 协调各个模块
- 处理 SSE 流的主逻辑
- 断线重连机制
- 流结束后的清理工作

**关键功能**：
- `sendMessage()`: 发送消息并处理 SSE 流
- `abort()`: 取消请求
- `createAbortController()`: 创建新的 AbortController

---

### 2. `types.ts` - 类型定义 (~40 行)

**职责**：
- 定义所有公共类型和接口
- 提供类型安全

**导出类型**：
- `UseSSEStreamOptions`: Hook 配置选项
- `StreamState`: 流状态
- `StreamResult`: 流处理结果
- `UploadPayload`: 上传负载

---

### 3. `raf-batching.ts` - RAF 批处理 (~100 行)

**职责**：
- 使用 requestAnimationFrame 优化流式渲染性能
- 减少 10-25% 的重渲染次数

**核心原理**：
```typescript
// 在同一帧（~16ms）内的多次更新会被合并为 1 次渲染
const scheduleUpdate = (content) => {
  pendingContent = content; // 累积最新内容
  
  if (rafId !== null) return; // 已安排，跳过
  
  rafId = requestAnimationFrame(() => {
    setState(pendingContent); // 1 次渲染
    rafId = null;
  });
};
```

**导出函数**：
- `useRAFBatching()`: 返回 `scheduleMessageUpdate` 和 `flushMessageUpdate`

**性能测试**：
- 1ms 间隔：减少 25% 渲染次数 ✅
- 5ms 间隔：减少 6% 渲染次数
- 真实场景：减少 10-25% 渲染次数

---

### 4. `upload.ts` - 上传逻辑 (~100 行)

**职责**：
- 处理不同的上传策略（直接、压缩、分片）
- 根据消息大小自动选择最优方案

**导出函数**：
- `uploadCompressedBlob()`: 上传压缩的 blob
- `handleMessageUpload()`: 处理消息上传策略

**上传策略**：
| 消息大小 | 策略 | 说明 |
|----------|------|------|
| < 100KB | `direct` | 直接上传 |
| 100KB - 1MB | `compression` | 压缩后上传 |
| 1MB - 5MB | `chunking` | 分片上传 |
| > 5MB | `too-large` | 提示用户确认 |

---

### 5. `multi-agent-handlers.ts` - 多 Agent 事件处理器 (~300 行)

**职责**：
- 处理多 Agent 模式的所有 SSE 事件
- 管理轮次（rounds）和 agent 输出

**核心功能**：
- `handleAgentStart()`: agent 开始生成
- `handleAgentChunk()`: agent 流式输出
- `handleAgentComplete()`: agent 完成生成
- `handleAgentOutput()`: agent 输出（向后兼容）
- `handleHostDecision()`: Host 决策
- `handleSessionComplete()`: 会话完成
- `cloneRoundsForReact()`: 深拷贝 rounds 数据（避免 React 状态冻结）

**数据流**：
```
agent_start → 创建占位符
            ↓
agent_chunk → 流式更新内容
            ↓
agent_complete → 完成并固化输出
            ↓
host_decision → Host 决策下一步
            ↓
session_complete → 会话结束
```

---

### 6. `chunking-handlers.ts` - Chunking 事件处理器 (~70 行)

**职责**：
- 处理超长文本的分段智能处理
- 管理 Chunking 进度

**核心功能**：
- `handleChunkingInit()`: 初始化 Chunking
- `handleChunkingProgress()`: Chunking 进度更新
- `handleChunkingChunk()`: 单段处理完成

**Chunking 阶段**：
1. `split`: 智能切分文本
2. `map`: 分析每段
3. `reduce`: 合并分析结果
4. `final`: 生成最终评审报告

---

## 🔄 数据流

```
用户输入
   ↓
handleMessageUpload() → 选择上传策略
   ↓
sendMessage() → 构建请求体
   ↓
runStreamOnce() → 处理 SSE 流
   ↓
事件分发：
   ├─ chunking_* → chunking-handlers.ts
   ├─ agent_* → multi-agent-handlers.ts
   └─ content/thinking → RAF 批处理
   ↓
scheduleMessageUpdate() → 批处理更新
   ↓
flushMessageUpdate() → 流结束，立即更新
```

## 🎨 设计模式

### 1. **模块化设计**
- 每个模块职责单一
- 低耦合，高内聚
- 易于测试和维护

### 2. **策略模式**
- 上传策略：根据消息大小选择不同的上传方式
- 事件处理策略：根据事件类型分发到不同的处理器

### 3. **观察者模式**
- SSE 事件流作为被观察者
- 各个事件处理器作为观察者

### 4. **命令模式**
- `scheduleMessageUpdate()`: 延迟执行命令
- `flushMessageUpdate()`: 立即执行命令

## 📊 性能优化

### 1. **RAF 批处理**
- 减少 10-25% 的重渲染次数
- 降低 CPU 使用率（15-23%）
- 更流畅的用户体验

#### 为什么不依赖 React 18 自动批处理？

React 18 的自动批处理在事件处理器、useEffect、setTimeout 中表现良好，但在 SSE 流式场景下效果有限：

- 每个 SSE chunk 到达时 React 无法确定是否还有更多 chunks
- 高频率异步更新（1-10ms 间隔）时，批处理边界不确定

**实测对比**（100 个 chunks）：

| 间隔 | React 18 批处理 | RAF 批处理 | 优化效果 |
|------|----------------|-----------|---------|
| 10ms | 100 次渲染     | 100 次    | 0%      |
| 5ms  | 100 次渲染     | 94 次     | 6%      |
| 1ms  | 100 次渲染     | 75 次     | **25%** |

**真实 LLM 流式场景**（Volcengine/OpenAI）：

| 网络环境 | 预期优化 |
|---------|---------|
| 高速（1-3ms 间隔） | 20-30% |
| 中速（3-8ms 间隔） | 10-15% |
| 低速（> 10ms） | < 5% |

#### 为什么不用 useRef 避免重渲染？

- react-markdown 需要 props 变化才能触发渲染
- 需要手动处理 XSS、事件绑定
- 无法使用 React 组件（PlanCard、SourceLinks）
- 代码复杂度高，维护困难

#### 方案对比

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| React 18 批处理 | 零配置，自动优化 | SSE 流场景效果有限 | ⭐⭐⭐ |
| RAF 批处理 | 精确控制，明显优化 | 需要手动实现 | ⭐⭐⭐⭐⭐ |
| 时间节流（100ms） | 最大优化（80-90%） | 明显延迟感 | ⭐⭐ |

### 2. **智能上传**
- 自动选择最优上传方式
- 压缩大文件节省带宽
- 分片上传支持超大文件

### 3. **断线重连**
- 自动重试机制
- 指数退避策略
- 队列支持

## 🧪 测试

### 单元测试（推荐）

```typescript
// 测试 RAF 批处理
describe('RAF Batching', () => {
  it('should batch multiple updates within 16ms', () => {
    // ... test code
  });
});

// 测试上传策略
describe('Upload Strategy', () => {
  it('should select compression for 500KB message', () => {
    // ... test code
  });
});

// 测试多 Agent 事件处理
describe('Multi-Agent Handlers', () => {
  it('should handle agent_start event correctly', () => {
    // ... test code
  });
});
```

## 📖 使用示例

```typescript
import { useSSEStream } from '@/hooks/data/useSSEStream';

function ChatComponent() {
  const { sendMessage, abort, createAbortController } = useSSEStream({
    onConversationCreated: (convId) => {
      console.log('会话创建:', convId);
    },
  });

  const handleSend = async (text: string) => {
    createAbortController();
    
    try {
      await sendMessage(
        text,
        'user-msg-id',
        'assistant-msg-id'
      );
    } catch (error) {
      console.error('发送失败:', error);
    }
  };

  return (
    <div>
      <button onClick={() => handleSend('你好')}>发送</button>
      <button onClick={abort}>取消</button>
    </div>
  );
}
```

## 🔧 维护指南

### 添加新的事件类型

1. 在 `types.ts` 中添加类型定义（如果需要）
2. 在对应的事件处理器文件中添加处理函数
3. 在 `index.ts` 的 `runStreamOnce()` 中添加事件分发

### 修改 RAF 批处理逻辑

修改 `raf-batching.ts` 文件，所有使用 RAF 批处理的地方都会自动更新。

### 添加新的上传策略

修改 `upload.ts` 中的 `handleMessageUpload()` 函数。

## 📚 相关文档

- [RAF 批处理效果证明](../../../../test/test-sse-raf-proof.html)
- [性能优化总结](../../../../test/PERFORMANCE-OPTIMIZATION-SUMMARY.md)
- [React 18 批处理说明](../../../../test/WHY-RAF-NOT-WORKING.md)

## 🎯 未来优化方向

1. **更细粒度的模块拆分**
   - 将 `index.ts` 进一步拆分为 `stream-processor.ts` 和 `reconnect-handler.ts`

2. **增强错误处理**
   - 创建 `error-handlers.ts` 统一处理各种错误

3. **性能监控**
   - 添加性能指标收集
   - 实时监控渲染次数和 CPU 使用率

4. **测试覆盖**
   - 添加完整的单元测试
   - 添加集成测试

---

**版本**: v2.0  
**最后更新**: 2026-01-02  
**作者**: AI Assistant

