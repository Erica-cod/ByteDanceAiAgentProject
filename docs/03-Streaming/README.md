# 🌊 03-Streaming（流式传输）

## 📌 模块简介

本文件夹包含了 Server-Sent Events (SSE) 流式传输的完整实现方案。重点是**流式断点续传**技术，这是项目的核心创新之一。当 AI 生成长文本时，如何保证网络中断后能够自动恢复，而不丢失已生成的内容？

## 📚 核心文档

### ⭐ 核心技术文档

#### 1. STREAM_RESUME_USER_INTENT.md（17KB）⭐⭐
**流式恢复的用户意图分析**

这是本模块最重要的文档，深入分析了用户对流式恢复的期望。

**核心问题：**
- 用户期望流式恢复能做什么？
- 如何区分"恢复"和"重新生成"？
- 如何处理用户的中断操作？
- 如何避免不必要的恢复？

**解决方案：**
```typescript
// 恢复逻辑
if (isUserInterruption) {
  // 用户主动停止，不恢复
  showStopButton();
} else if (isNetworkError) {
  // 网络错误，自动恢复
  autoResume();
} else if (isTimeout) {
  // 超时，提示用户选择
  askUserToResume();
}
```

#### 2. STREAM_RESUME_GUIDE.md（12KB）
**流式恢复机制完整指南**

**技术实现：**
1. **状态保存**：实时保存已接收的内容
2. **断点记录**：记录中断时的位置
3. **自动重连**：检测到中断后自动重连
4. **增量恢复**：只请求中断后的内容

**核心代码：**
```typescript
// 保存恢复点
const saveCheckpoint = (content: string, offset: number) => {
  localStorage.setItem('resume_point', JSON.stringify({
    conversationId,
    messageId,
    content,
    offset,
    timestamp: Date.now()
  }));
};

// 恢复请求
const resumeStream = async () => {
  const checkpoint = getCheckpoint();
  const response = await fetch('/api/chat/resume', {
    method: 'POST',
    body: JSON.stringify({
      conversationId: checkpoint.conversationId,
      offset: checkpoint.offset
    })
  });
};
```

#### 3. STREAM_RESUME_MEMORY_PROTECTION.md（9KB）
**流式恢复的内存保护机制**

**内存问题：**
- 长时间流式传输导致内存占用过高
- 频繁的状态更新导致 React re-render
- 大量的 DOM 节点导致浏览器卡顿

**解决方案：**
1. **虚拟化列表**：只渲染可见区域
2. **批量更新**：合并多次更新
3. **增量保存**：不保存完整历史
4. **定期清理**：清理过期的恢复点

```typescript
// 批量更新策略
const batchUpdate = useMemo(() => {
  let buffer = '';
  let timeoutId: NodeJS.Timeout;
  
  return (chunk: string) => {
    buffer += chunk;
    clearTimeout(timeoutId);
    
    timeoutId = setTimeout(() => {
      setContent(prev => prev + buffer);
      buffer = '';
    }, 100); // 100ms 批量更新一次
  };
}, []);
```

#### 4. ADAPTIVE_STREAMING_GUIDE.md（13KB）
**自适应流式传输指南**

**自适应策略：**
- 根据网络状况调整更新频率
- 根据设备性能调整渲染策略
- 根据内容长度调整缓存策略

**网络适配：**
```typescript
// 检测网络状况
const connection = navigator.connection;
const isSlowNetwork = connection.effectiveType === '2g' || 
                      connection.effectiveType === 'slow-2g';

// 自适应策略
const updateInterval = isSlowNetwork ? 500 : 100;
const chunkSize = isSlowNetwork ? 1024 : 256;
```

### 📋 实现文档

#### 5. STREAMING_IMPLEMENTATION_SUMMARY.md（12KB）
**流式传输实现总结**

**技术栈：**
- **前端**：EventSource API / fetch with ReadableStream
- **后端**：Express SSE / 自定义 SSE Writer
- **协议**：Server-Sent Events (SSE)

**为什么选择 SSE？**
- ✅ 简单：基于 HTTP，无需额外协议
- ✅ 自动重连：浏览器原生支持
- ✅ 单向传输：适合 AI 输出场景
- ❌ 不支持双工：如需双向通信需要额外方案

**对比 WebSocket：**
| 特性 | SSE | WebSocket |
|------|-----|-----------|
| 协议 | HTTP | 独立协议 |
| 方向 | 单向（服务端 → 客户端） | 双向 |
| 重连 | 浏览器自动 | 需要手动实现 |
| 部署 | 简单 | 需要额外配置 |
| 适用场景 | AI 流式输出 | 实时聊天 |

#### 6. STREAMING_MULTI_AGENT_GUIDE.md（17KB）
**多智能体流式传输指南**

**挑战：**
- 多个 Agent 同时输出
- 如何区分不同 Agent 的输出？
- 如何保证输出顺序？
- 如何处理 Agent 之间的等待？

**解决方案：**
```typescript
// 多智能体流式协议
{
  type: 'agent_output',
  agent: 'planner',
  content: '...',
  sequence: 1
}

{
  type: 'agent_output',
  agent: 'reporter',
  content: '...',
  sequence: 2
}
```

#### 7. STREAMING_TEST_GUIDE.md（8KB）
**流式传输测试指南**

**测试场景：**
1. **正常流式**：完整接收所有内容
2. **网络中断**：模拟断网后恢复
3. **慢速网络**：测试在弱网环境下的表现
4. **大文本**：测试 10MB+ 文本的流式传输
5. **用户中断**：用户点击停止按钮

### 🔧 问题修复

#### 8. SSE_CONNECTION_GUARD.md（8KB）
**SSE 连接守卫**

**问题：**
- 连接泄漏：未正确关闭的连接
- 重复连接：多次创建相同的连接
- 僵尸连接：连接已断但未检测到

**解决方案：**
```typescript
// 连接守卫
class SSEConnectionGuard {
  private activeConnections = new Map<string, EventSource>();
  
  connect(url: string) {
    // 关闭已存在的连接
    this.disconnect(url);
    
    // 创建新连接
    const eventSource = new EventSource(url);
    this.activeConnections.set(url, eventSource);
    
    return eventSource;
  }
  
  disconnect(url: string) {
    const connection = this.activeConnections.get(url);
    if (connection) {
      connection.close();
      this.activeConnections.delete(url);
    }
  }
}
```

#### 9. CRITICAL_FIX_CONNECTION_ABORT.md（10KB）
**连接中断关键修复**

**严重问题：**
- 用户刷新页面时，服务端连接未正确关闭
- 导致服务端资源泄漏
- 大量僵尸连接占用服务器资源

**修复方案：**
```typescript
// 客户端：页面卸载时关闭连接
useEffect(() => {
  return () => {
    eventSource?.close();
    
    // 发送中断信号
    navigator.sendBeacon('/api/chat/abort', JSON.stringify({
      conversationId
    }));
  };
}, []);

// 服务端：监听客户端断开
req.on('close', () => {
  // 清理资源
  cleanupResources(conversationId);
  
  // 取消 LLM 调用
  abortController.abort();
});
```

## 🎯 关键技术点

### SSE 工作原理

```
Client                          Server
  |                               |
  |--- GET /api/chat/stream ----->|
  |                               |
  |<--- Content-Type: text/event-stream
  |                               |
  |<--- data: chunk1              |
  |<--- data: chunk2              |
  |<--- data: chunk3              |
  |                               |
  [Connection Lost]               |
  |                               |
  |--- GET /api/chat/resume ----->|
  |                               |
  |<--- data: chunk4              |
  |<--- data: chunk5              |
  |                               |
```

### 断点续传实现

**关键步骤：**
1. **实时保存**：每接收一个 chunk 就保存
2. **记录 offset**：记录已接收的字符数
3. **检测中断**：监听 error 和 close 事件
4. **自动恢复**：3 秒后自动重连
5. **增量请求**：只请求 offset 之后的内容

### 内存优化

**策略：**
1. **虚拟化渲染**：使用 react-virtuoso
2. **批量更新**：100ms 合并一次更新
3. **增量保存**：只保存最近的恢复点
4. **定期清理**：清理 30 天前的数据

## 💡 面试要点

### 1. SSE vs WebSocket
**问题：为什么选择 SSE 而不是 WebSocket？**
- **场景适配**：AI 输出是单向的，不需要双工
- **简单性**：SSE 基于 HTTP，无需额外配置
- **自动重连**：浏览器原生支持
- **穿透性**：更容易穿透代理和防火墙

### 2. 流式断点续传
**问题：流式断点续传是如何实现的？**
- **保存状态**：实时保存已接收的内容和 offset
- **检测中断**：监听网络错误和连接关闭
- **自动恢复**：检测到中断后自动重连
- **增量请求**：携带 offset 只请求新内容
- **用户控制**：区分用户主动停止和网络中断

### 3. 内存优化
**问题：长时间流式传输如何避免内存泄漏？**
- **虚拟化列表**：只渲染可见部分
- **批量更新**：减少 React re-render 次数
- **清理策略**：定期清理过期数据
- **监控告警**：监控内存使用情况

### 4. 多智能体流式
**问题：多个 Agent 同时输出如何处理？**
- **协议设计**：每条消息包含 agent 标识
- **顺序保证**：使用 sequence 字段
- **并发控制**：限制同时运行的 Agent 数量
- **状态管理**：每个 Agent 独立管理状态

### 5. 生产环境问题
**问题：流式传输在生产环境遇到的问题？**
- **连接泄漏**：未正确关闭的连接
  - 解决：连接守卫 + cleanup
- **超时问题**：长时间无数据导致超时
  - 解决：定期发送心跳
- **代理限制**：某些代理不支持流式
  - 解决：降级到轮询模式

## 🔗 相关模块

- **04-Multi-Agent**：多智能体的流式输出
- **05-Large-Text-Handling**：大文本的流式传输
- **06-Performance-Optimization**：流式传输的性能优化

## 📊 实现效果

### 用户体验提升
- ✅ **实时反馈**：AI 生成内容实时显示
- ✅ **无缝恢复**：网络中断后自动恢复
- ✅ **不丢内容**：已生成的内容永不丢失

### 性能指标
- **首字延迟**：< 500ms
- **流式速度**：50-100 tokens/s
- **恢复时间**：< 3s
- **成功率**：99.5%

### 稳定性
- ✅ **自动重连**：3次重试机制
- ✅ **优雅降级**：SSE 失败降级到轮询
- ✅ **资源清理**：无内存泄漏

---

**建议阅读顺序：**
1. `STREAMING_IMPLEMENTATION_SUMMARY.md` - 理解基本实现
2. `STREAM_RESUME_USER_INTENT.md` - 理解用户需求
3. `STREAM_RESUME_GUIDE.md` - 学习恢复机制
4. `STREAM_RESUME_MEMORY_PROTECTION.md` - 了解内存优化
5. `CRITICAL_FIX_CONNECTION_ABORT.md` - 学习问题修复

**相关代码文件：**
- `src/hooks/data/useSSEStream.ts` - SSE 流式传输 Hook
- `api/handlers/sseHandler.ts` - 服务端 SSE 处理

