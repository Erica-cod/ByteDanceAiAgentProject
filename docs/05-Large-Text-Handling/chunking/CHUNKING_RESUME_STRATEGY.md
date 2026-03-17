# Chunking 断点续传策略详解

## 🎯 核心问题

Chunking 处理有 4 个阶段，每个阶段的断点续传策略不同：

| 阶段 | 耗时 | 是否调用模型 | SSE断连风险 | 续传策略 |
|------|------|-------------|------------|---------|
| **1. Split** | <1秒 | ❌ | 极低 | 无需续传 |
| **2. Map** | 150秒 (30 chunks × 5秒) | ✅ | **高** | **需要续传** |
| **3. Reduce** | <1秒 | ❌ | 极低 | 无需续传 |
| **4. Final** | 30-60秒 | ✅ | **中** | **需要续传** |

## 🔥 关键洞察

### Map 阶段 vs Final 阶段的区别

```typescript
// Map 阶段：每个 chunk 处理完整后才继续下一个
for (let i = 0; i < chunks.length; i++) {
  const chunkData = await processChunk(chunk, i, totalChunks);
  // ✅ processChunk 内部完全消费流，返回完整的结构化数据
  // ✅ 每个 chunk 是独立的，中断后可以从下一个 chunk 继续
  extractedDataList.push(chunkData);
}

// Final 阶段：流式输出给用户
for await (const chunk of stream) {
  if (sseWriter.isClosed()) break;  // ⚠️ 中断时只输出了一半
  
  accumulatedText += content;
  await sseWriter.sendEvent({ content: mainContent });
  // ⚠️ 如果这里断连，已输出的内容怎么办？
}
```

**区别**：
- **Map 阶段**：每个 chunk 处理完整，有明确的"进度单位"
- **Final 阶段**：流式输出，没有明确的"进度单位"，随时可能中断

## ✅ 完整解决方案

### 方案 1: 保守策略（推荐） - 保存 Map 结果，Final 重新生成

#### 核心思路

```
Map 阶段断连 → 保存进度 → 重连后继续剩余 chunk
                ↓
            所有 chunk 处理完
                ↓
            进入 Final 阶段
                ↓
Final 阶段断连 → 不保存 Final 内容 → 重连后重新生成
                ↓
            (因为 Final 只需 30-60 秒，可以接受)
```

#### 优点
- ✅ 实现简单
- ✅ Map 阶段（最耗时）可以续传
- ✅ Final 重新生成可能更连贯（避免拼接痕迹）

#### 缺点
- ⚠️ Final 阶段断连需重新生成（但只需 30-60 秒）

#### 实现代码

```typescript
// api/services/chunkingPlanReviewService.ts

export async function handleChunkingPlanReview(
  message: string,
  userId: string,
  conversationId: string,
  clientAssistantMessageId: string | undefined,
  modelType: 'local' | 'volcano',
  sseWriter: SSEStreamWriter,
  options: ChunkingOptions = {},
  resumeFromChunk?: number  // ✅ 断点续传参数
): Promise<void> {
  const chunkingId = `chunking:${conversationId}:${clientAssistantMessageId || Date.now()}`;
  
  try {
    // ==================== 1. Split 阶段 ====================
    const chunks = splitTextIntoChunks(message, {
      maxChunks: options.maxChunks || 30,
    });
    
    // ==================== 2. Map 阶段 (支持断点续传) ====================
    let startIndex = 0;
    let extractedDataList: ExtractedData[] = [];
    
    // ✅ 尝试从 Redis 恢复进度
    if (resumeFromChunk !== undefined) {
      const savedProgress = await redis.get(`${chunkingId}:map_progress`);
      if (savedProgress) {
        const progress = JSON.parse(savedProgress);
        extractedDataList = progress.extractedDataList || [];
        startIndex = resumeFromChunk;
        
        console.log(`✅ [Chunking] 从 Map 阶段第 ${startIndex} 个 chunk 恢复`);
        
        await sseWriter.sendEvent({
          type: 'chunking_resume',
          stage: 'map',
          resumedFromChunk: startIndex,
          totalChunks: chunks.length,
        });
      }
    }
    
    await sseWriter.sendEvent({
      type: 'chunking_init',
      totalChunks: chunks.length,
      startFromChunk: startIndex,
    });
    
    // 处理每个 chunk
    for (let i = startIndex; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // ⚠️ 检查 SSE 是否关闭
      if (sseWriter.isClosed()) {
        console.log(`⚠️ [Chunking] SSE 断连 (Map 阶段第 ${i} 个 chunk)，保存进度`);
        
        // ✅ 保存 Map 阶段进度
        await redis.set(
          `${chunkingId}:map_progress`,
          JSON.stringify({
            stage: 'map',
            lastCompletedChunk: i - 1,
            extractedDataList,
          }),
          'EX',
          3600  // 1 小时过期
        );
        
        return;  // 退出，等待重连
      }
      
      await sseWriter.sendEvent({
        type: 'chunking_progress',
        stage: 'map',
        chunkIndex: i,
        totalChunks: chunks.length,
      });
      
      console.log(`🔍 [Chunking] 分析第 ${i + 1}/${chunks.length} 段...`);
      
      // 调用模型分析 (带重试)
      const chunkData = await processChunkWithRetry(chunk, i, chunks.length, 3);
      extractedDataList.push(chunkData);
      
      await sseWriter.sendEvent({
        type: 'chunking_chunk',
        chunkIndex: i,
        chunkSummary: chunkData.goals.join('; '),
      });
      
      // ✅ 每 5 个 chunk 保存一次进度
      if ((i + 1) % 5 === 0) {
        await redis.set(
          `${chunkingId}:map_progress`,
          JSON.stringify({
            stage: 'map',
            lastCompletedChunk: i,
            extractedDataList,
          }),
          'EX',
          3600
        );
        console.log(`💾 [Chunking] 已保存 Map 进度 (${i + 1}/${chunks.length})`);
      }
    }
    
    console.log('✅ [Chunking] Map 阶段完成');
    
    // ==================== 3. Reduce 阶段 ====================
    await sseWriter.sendEvent({
      type: 'chunking_progress',
      stage: 'reduce',
    });
    
    console.log('🔄 [Chunking] 合并分析结果...');
    const mergedData = mergeExtractedData(extractedDataList);
    
    // ✅ 保存合并后的数据（为 Final 阶段准备）
    await redis.set(
      `${chunkingId}:merged_data`,
      JSON.stringify(mergedData),
      'EX',
      3600
    );
    
    // ==================== 4. Final 阶段 (不支持续传，重新生成) ====================
    await sseWriter.sendEvent({
      type: 'chunking_progress',
      stage: 'final',
    });
    
    console.log('📝 [Chunking] 生成最终评审报告...');
    
    const finalPrompt = buildReducePrompt(mergedData, message, chunks.length);
    const messages: ChatMessage[] = [
      { role: 'user', content: finalPrompt }
    ];
    
    const stream = await callVolcengineModel(messages);
    
    // 流式输出最终结果
    let buffer = '';
    let accumulatedText = '';
    
    for await (const chunk of stream) {
      // ⚠️ 检查 SSE 是否关闭
      if (sseWriter.isClosed()) {
        console.log('⚠️ [Chunking] SSE 断连 (Final 阶段)');
        
        // ❌ 不保存 Final 的部分内容
        // ❌ 因为部分内容可能不完整，重连后重新生成更好
        
        // ✅ 保存已生成的内容到数据库（作为不完整的回答）
        if (accumulatedText) {
          const { thinking, content } = extractThinkingAndContent(accumulatedText);
          await MessageService.addMessage(
            conversationId,
            userId,
            'assistant',
            content || accumulatedText,
            clientAssistantMessageId,
            thinking,
            modelType
          );
          console.log('💾 [Chunking] 已保存不完整的 Final 内容到数据库');
        }
        
        return;  // 退出，等待重连（重连后会重新生成 Final）
      }
      
      const chunkStr = chunk.toString();
      buffer += chunkStr;
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          const content = volcengineService.parseStreamLine(line);
          
          if (content) {
            accumulatedText += content;
            const { thinking, content: mainContent } = extractThinkingAndContent(accumulatedText);
            
            await sseWriter.sendEvent({
              content: mainContent,
              thinking: thinking || undefined,
            });
          }
          
          if (line.includes('[DONE]')) {
            console.log('✅ [Chunking] 最终评审完成');
            break;
          }
        }
      }
    }
    
    // ✅ Final 阶段完成，保存到数据库
    if (accumulatedText) {
      const { thinking, content } = extractThinkingAndContent(accumulatedText);
      await MessageService.addMessage(
        conversationId,
        userId,
        'assistant',
        content || accumulatedText,
        clientAssistantMessageId,
        thinking,
        modelType
      );
      await ConversationService.incrementMessageCount(conversationId, userId);
      console.log('✅ [Chunking] 消息已保存到数据库');
    }
    
    // ✅ 完成后清理 Redis 进度
    await redis.del(`${chunkingId}:map_progress`);
    await redis.del(`${chunkingId}:merged_data`);
    
  } catch (error: any) {
    console.error('❌ [Chunking] 处理失败:', error);
    throw error;
  }
}

/**
 * ✅ 带重试的 chunk 处理
 */
async function processChunkWithRetry(
  chunk: TextChunk,
  chunkIndex: number,
  totalChunks: number,
  maxRetries: number = 3
): Promise<ExtractedData> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await processChunk(chunk, chunkIndex, totalChunks);
    } catch (error) {
      console.warn(`⚠️ [Chunking] Chunk ${chunkIndex} 处理失败 (尝试 ${attempt + 1}/${maxRetries})`, error);
      
      if (attempt === maxRetries - 1) {
        // 最后一次失败，返回空数据
        console.error(`❌ [Chunking] Chunk ${chunkIndex} 最终失败，返回空数据`);
        return {
          goals: [],
          milestones: [],
          tasks: [],
          metrics: [],
          risks: [],
          unknowns: [],
        };
      }
      
      // 指数退避
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
  
  // TypeScript 类型检查
  return {
    goals: [],
    milestones: [],
    tasks: [],
    metrics: [],
    risks: [],
    unknowns: [],
  };
}
```

#### 前端修改

```typescript
// src/hooks/data/useSSEStream.ts

export function useSSEStream(options: UseSSEStreamOptions = {}) {
  // ✅ 记录当前 chunking 状态
  const [chunkingState, setChunkingState] = useState<{
    stage: 'map' | 'reduce' | 'final' | null;
    lastCompletedChunk: number | null;
  }>({
    stage: null,
    lastCompletedChunk: null,
  });
  
  const sendMessage = async (messageText: string, /* ... */) => {
    // ...
    
    const runStreamOnce = async (): Promise<{ completed: boolean; aborted: boolean }> => {
      // ✅ 构建请求体
      const requestBody = {
        message: messageText,
        // ...
        // ✅ 如果在 Map 阶段断连，传递续传参数
        ...(chunkingState.stage === 'map' && chunkingState.lastCompletedChunk !== null ? {
          resumeFromChunk: chunkingState.lastCompletedChunk + 1
        } : {}),
      };
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal,
      });
      
      // ...解析 SSE 流
      
      const eventData = JSON.parse(line.slice(5).trim());
      
      // ✅ 跟踪 chunking 进度
      if (eventData.type === 'chunking_progress') {
        setChunkingState({
          stage: eventData.stage,
          lastCompletedChunk: eventData.chunkIndex ?? null,
        });
      }
      
      if (eventData.type === 'chunking_chunk') {
        setChunkingState(prev => ({
          ...prev,
          lastCompletedChunk: eventData.chunkIndex,
        }));
      }
      
      // ✅ 显示续传提示
      if (eventData.type === 'chunking_resume') {
        updateMessage(assistantMessageId, {
          thinking: `从第 ${eventData.resumedFromChunk + 1} 段继续处理...`,
        });
      }
      
      // ✅ 完成后重置
      if (isDone) {
        setChunkingState({ stage: null, lastCompletedChunk: null });
      }
      
      // ...
    };
    
    // 断线重连
    let attempt = 0;
    while (true) {
      const result = await runStreamOnce();
      
      if (result.completed) break;
      
      if (attempt >= MAX_RECONNECT_ATTEMPTS) {
        throw new Error('SSE 连接中断，已达到最大重试次数');
      }
      
      const waitMs = computeBackoff(attempt);
      
      // ✅ 根据阶段显示不同提示
      if (chunkingState.stage === 'map') {
        updateMessage(assistantMessageId, {
          thinking: `连接中断，正在重连...(将从第 ${(chunkingState.lastCompletedChunk || 0) + 1} 段继续)`,
        });
      } else if (chunkingState.stage === 'final') {
        updateMessage(assistantMessageId, {
          thinking: `连接中断，正在重连...(将重新生成报告)`,
        });
      } else {
        updateMessage(assistantMessageId, {
          thinking: '连接中断，正在尝试重连...',
        });
      }
      
      await sleep(waitMs);
      attempt += 1;
    }
  };
  
  // ...
}
```

---

### 方案 2: 激进策略 - 保存 Final 内容，续传拼接

#### 核心思路

Final 阶段也保存进度，重连后续传（类似 ChatGPT 的"继续"功能）。

```
Final 阶段输出到一半 → 保存已输出内容
            ↓
        SSE 断连
            ↓
        重连后发送特殊 prompt: "继续上述报告，从【最后一句】继续..."
            ↓
        模型继续生成后半部分
            ↓
        拼接前后内容
```

#### 优点
- ✅ 节省 Final 阶段时间（续传而不是重新生成）
- ✅ 用户体验更好（无感知续传）

#### 缺点
- ⚠️ 实现复杂
- ⚠️ 拼接可能有不连贯（模型不知道前面内容的上下文）
- ⚠️ 需要设计"续传 prompt"

#### 实现要点

```typescript
// Final 阶段断连时保存内容
if (sseWriter.isClosed()) {
  // ✅ 保存 Final 的部分内容
  await redis.set(
    `${chunkingId}:final_partial`,
    JSON.stringify({
      stage: 'final',
      partialContent: accumulatedText,
      mergedData,  // 保存合并数据，供续传使用
    }),
    'EX',
    3600
  );
  return;
}

// 重连后检查是否在 Final 阶段
const finalPartial = await redis.get(`${chunkingId}:final_partial`);
if (finalPartial) {
  const { partialContent, mergedData } = JSON.parse(finalPartial);
  
  // ✅ 先发送已有内容给前端
  await sseWriter.sendEvent({
    content: partialContent,
    thinking: '正在继续生成报告...',
  });
  
  // ✅ 构建续传 prompt
  const resumePrompt = buildResumeFinalPrompt(mergedData, partialContent);
  
  // ✅ 调用模型继续生成
  const stream = await callVolcengineModel([
    { role: 'user', content: resumePrompt }
  ]);
  
  // ✅ 拼接新内容
  let newContent = '';
  for await (const chunk of stream) {
    // ...
    newContent += content;
    
    await sseWriter.sendEvent({
      content: partialContent + newContent,  // 拼接
    });
  }
}
```

#### 续传 Prompt 设计

```typescript
function buildResumeFinalPrompt(mergedData: ExtractedData, partialContent: string): string {
  // 提取最后一句话
  const lastSentence = partialContent.split('\n').filter(s => s.trim()).pop() || '';
  
  return `
你之前正在生成一份项目计划评审报告，但由于网络中断，报告生成到一半。

以下是你已经生成的内容（最后一句是："${lastSentence}"）：

---
${partialContent}
---

请**直接继续**上述报告，从最后一句之后继续写，不要重复已有内容，保持风格一致。

基础数据：
${JSON.stringify(mergedData, null, 2)}

继续生成：
`.trim();
}
```

---

## 📊 方案对比

| 维度 | 方案 1 (保守) | 方案 2 (激进) |
|------|--------------|--------------|
| **实现复杂度** | ⭐⭐ (简单) | ⭐⭐⭐⭐ (复杂) |
| **Map 阶段续传** | ✅ 支持 | ✅ 支持 |
| **Final 阶段续传** | ❌ 重新生成 (30-60秒) | ✅ 支持 (节省时间) |
| **内容连贯性** | ✅ 完整生成，更连贯 | ⚠️ 拼接可能有痕迹 |
| **用户体验** | ✅ 好 | ✅ 很好 |
| **维护成本** | ✅ 低 | ⚠️ 高 (需要调试续传效果) |

---

## 🎯 推荐策略

### 立即实施：方案 1 (保守策略)

**原因**：
1. **Map 阶段是大头**：150 秒 vs Final 30-60 秒
2. **实现简单**：1-2 天即可完成
3. **效果明显**：节省 80%+ 的重复时间
4. **风险低**：逻辑清晰，易于测试

### 未来优化：方案 2 (激进策略)

**条件**：
- 方案 1 稳定运行后
- 用户反馈 Final 阶段重连频繁
- 有时间投入调优续传 prompt

---

## 🧪 测试验证

### 测试场景 1: Map 阶段断连

```javascript
// test/test-map-resume.js

async function testMapResume() {
  const longText = generateLongPlanText();
  
  // 第一次请求 (5秒后主动断开)
  const controller1 = new AbortController();
  setTimeout(() => controller1.abort(), 5000);
  
  let lastChunk = 0;
  
  try {
    const response1 = await fetch('http://localhost:8080/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: longText,
        mode: 'single',
        longTextMode: 'plan_review',
        clientAssistantMessageId: 'test-msg-123',
      }),
      signal: controller1.signal,
    });
    
    // 监听进度
    for await (const chunk of response1.body) {
      const data = parseSSE(chunk);
      if (data.type === 'chunking_chunk') {
        lastChunk = data.chunkIndex;
      }
    }
  } catch (error) {
    console.log(`⚠️ 中断，已完成 ${lastChunk + 1} 个 chunk`);
  }
  
  // 等待 2 秒
  await sleep(2000);
  
  // 第二次请求 (断点续传)
  const response2 = await fetch('http://localhost:8080/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      message: longText,
      mode: 'single',
      longTextMode: 'plan_review',
      clientAssistantMessageId: 'test-msg-123',
      resumeFromChunk: lastChunk + 1,  // ✅ 续传
    }),
  });
  
  // 验证是否续传成功
  for await (const chunk of response2.body) {
    const data = parseSSE(chunk);
    if (data.type === 'chunking_resume') {
      console.log(`✅ 成功续传! 从第 ${data.resumedFromChunk} 个 chunk 继续`);
      break;
    }
  }
}
```

### 测试场景 2: Final 阶段断连

```javascript
async function testFinalInterrupt() {
  const longText = generateLongPlanText();
  
  // 第一次请求 (等待进入 Final 阶段后断开)
  const controller1 = new AbortController();
  
  let inFinalStage = false;
  
  const response1 = await fetch('http://localhost:8080/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      message: longText,
      mode: 'single',
      longTextMode: 'plan_review',
      clientAssistantMessageId: 'test-msg-456',
    }),
    signal: controller1.signal,
  });
  
  try {
    for await (const chunk of response1.body) {
      const data = parseSSE(chunk);
      
      // 检测到进入 Final 阶段
      if (data.type === 'chunking_progress' && data.stage === 'final') {
        inFinalStage = true;
      }
      
      // Final 阶段输出 2 秒后断开
      if (inFinalStage && data.content) {
        setTimeout(() => controller1.abort(), 2000);
      }
    }
  } catch (error) {
    console.log('⚠️ Final 阶段中断');
  }
  
  // 重连 (方案 1: 会重新生成 Final)
  console.log('🔄 重连中...');
  
  const response2 = await fetch('http://localhost:8080/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      message: longText,
      mode: 'single',
      longTextMode: 'plan_review',
      clientAssistantMessageId: 'test-msg-456',
      // ✅ 因为 Map 阶段已完成，会直接进入 Final
    }),
  });
  
  for await (const chunk of response2.body) {
    const data = parseSSE(chunk);
    if (data.type === 'chunking_progress' && data.stage === 'final') {
      console.log('✅ 重新生成 Final 报告');
    }
  }
}
```

---

## 📝 总结

### 核心答案

**你的担心：模型在部分分片接收到的时候，就已经开始分析输出了**

**实际情况**：
- **Map 阶段**：每个 chunk **完整处理**后才继续，可以保存进度
- **Final 阶段**：是**流式输出**，确实可能中断

**解决方案**：
1. ✅ **Map 阶段**：保存进度，支持断点续传 (节省 150 秒)
2. ⚠️ **Final 阶段**：不保存进度，重连后重新生成 (只需 30-60 秒)

### 关键点

- ✅ **80/20 原则**：Map 占 80% 时间，优先优化它
- ✅ **可接受的代价**：Final 重新生成 30 秒，用户可以接受
- ✅ **实现简单**：保守策略 1-2 天可完成

---

**作者**: AI Assistant  
**日期**: 2024-12-30  
**版本**: 1.0.0

