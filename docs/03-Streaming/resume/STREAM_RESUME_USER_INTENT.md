# 续流功能：区分用户意图

## 🎯 核心问题

需要区分两种断开连接的情况：

| 场景 | 前端行为 | 是否续传 | 原因 |
|------|---------|---------|------|
| **用户主动停止** | 点击"停止生成"按钮 | ❌ 否 | 用户不想要后续内容 |
| **网络波动** | 连接意外断开 | ✅ 是 | 用户想要完整内容 |

---

## 💡 实现方案

### 1. 前端状态管理

```typescript
// src/hooks/data/useSSEStream.ts

// 用户意图标识
let userStoppedGeneration = false;  // 用户是否主动停止

// 续传信息
interface ResumeInfo {
  messageId: string;
  position: number;
  timestamp: number;  // 保存时间戳，用于过期检查
}
```

---

### 2. 停止生成按钮

```typescript
// 用户点击"停止生成"
const handleStopGeneration = () => {
  console.log('用户主动停止生成');
  
  // 1. 标记为用户主动停止
  userStoppedGeneration = true;
  
  // 2. 关闭 EventSource
  if (eventSource) {
    eventSource.close();
  }
  
  // 3. 清除可能存在的续传信息（因为用户不想要后续内容）
  sessionStorage.removeItem(`resumeInfo_${conversationId}`);
  
  // 4. 更新 UI 状态
  setIsGenerating(false);
  
  // 5. 可选：通知后端用户已停止（让后端也可以停止生成，节省资源）
  fetch('/api/chat/stop', {
    method: 'POST',
    body: JSON.stringify({
      messageId: currentAssistantMessageId,
      conversationId,
      userId,
    }),
  }).catch(console.error);
};
```

---

### 3. 网络断开检测

```typescript
// EventSource 错误处理
eventSource.onerror = (error) => {
  console.error('SSE 连接错误:', error);
  
  // ✅ 关键：只有非用户主动停止才保存续传信息
  if (!userStoppedGeneration) {
    console.log('⚠️  网络波动导致断开，保存续传信息');
    
    const resumeInfo: ResumeInfo = {
      messageId: currentAssistantMessageId,
      position: lastReceivedPosition,
      timestamp: Date.now(),
    };
    
    // 保存到 sessionStorage（按会话ID区分）
    sessionStorage.setItem(
      `resumeInfo_${conversationId}`,
      JSON.stringify(resumeInfo)
    );
    
    // 显示重连提示
    showReconnectPrompt();
  } else {
    console.log('✅ 用户主动停止，不保存续传信息');
  }
  
  // 关闭连接
  eventSource.close();
  setIsGenerating(false);
};
```

---

### 4. 消息更新时记录位置

```typescript
// SSE 消息处理
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.content) {
    // 更新消息内容
    updateMessage(currentAssistantMessageId, {
      content: data.content,
      thinking: data.thinking,
    });
    
    // ✅ 记录已接收的位置（字符数）
    lastReceivedPosition = data.content.length;
  }
  
  if (data.type === 'done' || data === '[DONE]') {
    // 生成完成，清除续传信息
    sessionStorage.removeItem(`resumeInfo_${conversationId}`);
    setIsGenerating(false);
  }
};
```

---

### 5. 重连/续传逻辑

```typescript
// 发送消息时检查是否有未完成的续传
const sendMessage = async (messageText: string) => {
  // 重置用户停止标志
  userStoppedGeneration = false;
  
  // 检查是否有未完成的续传
  const resumeInfoStr = sessionStorage.getItem(`resumeInfo_${conversationId}`);
  let resumeFrom = null;
  
  if (resumeInfoStr) {
    const resumeInfo: ResumeInfo = JSON.parse(resumeInfoStr);
    
    // 检查是否过期（比如超过5分钟）
    const elapsed = Date.now() - resumeInfo.timestamp;
    const RESUME_TIMEOUT = 5 * 60 * 1000; // 5分钟
    
    if (elapsed < RESUME_TIMEOUT) {
      console.log('✅ 检测到未完成的续传，尝试续传');
      resumeFrom = {
        messageId: resumeInfo.messageId,
        position: resumeInfo.position,
      };
    } else {
      console.log('⚠️  续传信息已过期，清除');
      sessionStorage.removeItem(`resumeInfo_${conversationId}`);
    }
  }
  
  // 发送请求
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: messageText,
      userId,
      conversationId,
      modelType,
      resumeFrom,  // ✅ 如果有续传信息，传递给后端
      // ... 其他参数
    }),
  });
  
  // 如果续传成功，清除保存的信息
  if (response.ok && resumeFrom) {
    sessionStorage.removeItem(`resumeInfo_${conversationId}`);
  }
  
  // 开始接收 SSE
  const eventSource = new EventSource(/* ... */);
  // ...
};
```

---

### 6. UI 改进：显示续传提示

```typescript
// 组件状态
const [hasPendingResume, setHasPendingResume] = useState(false);
const [pendingResumeInfo, setPendingResumeInfo] = useState<ResumeInfo | null>(null);

// 检查是否有待续传的内容
useEffect(() => {
  const checkPendingResume = () => {
    const resumeInfoStr = sessionStorage.getItem(`resumeInfo_${conversationId}`);
    if (resumeInfoStr) {
      const resumeInfo = JSON.parse(resumeInfoStr);
      
      // 检查是否过期
      const elapsed = Date.now() - resumeInfo.timestamp;
      if (elapsed < 5 * 60 * 1000) {
        setHasPendingResume(true);
        setPendingResumeInfo(resumeInfo);
      } else {
        sessionStorage.removeItem(`resumeInfo_${conversationId}`);
      }
    }
  };
  
  checkPendingResume();
}, [conversationId]);

// 续传提示 UI
{hasPendingResume && (
  <div className="resume-prompt">
    <span>检测到未完成的消息，是否继续接收？</span>
    <button onClick={handleResumeStream}>继续接收</button>
    <button onClick={handleDiscardResume}>放弃</button>
  </div>
)}
```

---

### 7. 完整示例代码

```typescript
// src/hooks/data/useSSEStream.ts

export function useSSEStream() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasPendingResume, setHasPendingResume] = useState(false);
  
  // 用户意图标识
  let userStoppedGeneration = false;
  
  // 当前消息状态
  let currentAssistantMessageId = '';
  let lastReceivedPosition = 0;
  let eventSourceRef = useRef<EventSource | null>(null);

  /**
   * 用户主动停止生成
   */
  const stopGeneration = () => {
    console.log('🛑 用户主动停止生成');
    
    // 1. 标记为用户主动停止
    userStoppedGeneration = true;
    
    // 2. 关闭连接
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    // 3. 清除续传信息（用户不想要后续内容）
    sessionStorage.removeItem(`resumeInfo_${conversationId}`);
    setHasPendingResume(false);
    
    // 4. 更新状态
    setIsGenerating(false);
    
    // 5. 可选：通知后端停止（节省资源）
    fetch('/api/chat/stop', {
      method: 'POST',
      body: JSON.stringify({
        messageId: currentAssistantMessageId,
        conversationId,
        userId,
      }),
    }).catch(console.error);
  };

  /**
   * 发送消息（支持续传）
   */
  const sendMessage = async (messageText: string) => {
    // 重置停止标志
    userStoppedGeneration = false;
    
    // 生成消息ID
    currentAssistantMessageId = `assistant_${Date.now()}`;
    lastReceivedPosition = 0;
    
    // 检查是否有待续传的内容
    let resumeFrom = null;
    const resumeInfoStr = sessionStorage.getItem(`resumeInfo_${conversationId}`);
    
    if (resumeInfoStr) {
      try {
        const resumeInfo = JSON.parse(resumeInfoStr);
        const elapsed = Date.now() - resumeInfo.timestamp;
        
        if (elapsed < 5 * 60 * 1000) { // 5分钟内有效
          console.log('🔄 检测到续传信息，尝试续传');
          resumeFrom = {
            messageId: resumeInfo.messageId,
            position: resumeInfo.position,
          };
          currentAssistantMessageId = resumeInfo.messageId;
        } else {
          console.log('⏰ 续传信息已过期');
          sessionStorage.removeItem(`resumeInfo_${conversationId}`);
        }
      } catch (error) {
        console.error('解析续传信息失败:', error);
        sessionStorage.removeItem(`resumeInfo_${conversationId}`);
      }
    }
    
    setIsGenerating(true);
    
    // 发送请求
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: messageText,
        userId,
        conversationId,
        modelType: 'volcano',
        clientAssistantMessageId: currentAssistantMessageId,
        resumeFrom, // ✅ 续传参数
      }),
    });
    
    if (!response.ok) {
      throw new Error('请求失败');
    }
    
    // 读取 SSE 流
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    // 模拟 EventSource 行为
    const processStream = async () => {
      try {
        while (true) {
          const { done, value } = await reader!.read();
          
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));
              
              if (data.content) {
                // 更新消息
                updateMessage(currentAssistantMessageId, {
                  content: data.content,
                  thinking: data.thinking,
                });
                
                // ✅ 记录位置
                lastReceivedPosition = data.content.length;
              }
              
              if (data.type === 'done' || data === '[DONE]') {
                // 完成，清除续传信息
                sessionStorage.removeItem(`resumeInfo_${conversationId}`);
                setHasPendingResume(false);
                setIsGenerating(false);
                break;
              }
            }
          }
        }
      } catch (error: any) {
        console.error('流处理错误:', error);
        
        // ✅ 关键：只有非用户主动停止才保存续传信息
        if (!userStoppedGeneration) {
          console.log('⚠️  网络错误，保存续传信息');
          sessionStorage.setItem(
            `resumeInfo_${conversationId}`,
            JSON.stringify({
              messageId: currentAssistantMessageId,
              position: lastReceivedPosition,
              timestamp: Date.now(),
            })
          );
          setHasPendingResume(true);
        }
        
        setIsGenerating(false);
      }
    };
    
    await processStream();
  };

  /**
   * 放弃续传
   */
  const discardResume = () => {
    console.log('🗑️  用户放弃续传');
    sessionStorage.removeItem(`resumeInfo_${conversationId}`);
    setHasPendingResume(false);
  };

  /**
   * 继续接收（续传）
   */
  const resumeStream = async () => {
    console.log('▶️  用户选择继续接收');
    
    const resumeInfoStr = sessionStorage.getItem(`resumeInfo_${conversationId}`);
    if (!resumeInfoStr) {
      console.error('未找到续传信息');
      return;
    }
    
    const resumeInfo = JSON.parse(resumeInfoStr);
    
    // 重置停止标志
    userStoppedGeneration = false;
    currentAssistantMessageId = resumeInfo.messageId;
    lastReceivedPosition = resumeInfo.position;
    
    setIsGenerating(true);
    
    // 发送续传请求（不需要 message，只需要 resumeFrom）
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        conversationId,
        modelType: 'volcano',
        resumeFrom: {
          messageId: resumeInfo.messageId,
          position: resumeInfo.position,
        },
      }),
    });
    
    // ... 处理响应流 ...
  };

  return {
    sendMessage,
    stopGeneration,      // ✅ 用户主动停止
    resumeStream,        // ✅ 继续接收
    discardResume,       // ✅ 放弃续传
    isGenerating,
    hasPendingResume,
  };
}
```

---

## 🎨 UI 组件示例

```tsx
// src/components/Chat/ChatInput.tsx

export function ChatInput() {
  const {
    sendMessage,
    stopGeneration,
    resumeStream,
    discardResume,
    isGenerating,
    hasPendingResume,
  } = useSSEStream();

  return (
    <div className="chat-input">
      {/* 续传提示 */}
      {hasPendingResume && !isGenerating && (
        <div className="resume-banner">
          <div className="resume-banner-content">
            <AlertIcon />
            <span>检测到未完成的消息，是否继续接收？</span>
          </div>
          <div className="resume-banner-actions">
            <button
              className="btn-primary"
              onClick={resumeStream}
            >
              继续接收
            </button>
            <button
              className="btn-secondary"
              onClick={discardResume}
            >
              放弃
            </button>
          </div>
        </div>
      )}

      {/* 输入区域 */}
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={isGenerating}
        placeholder={isGenerating ? '正在生成中...' : '输入消息...'}
      />

      {/* 按钮 */}
      <div className="chat-actions">
        {isGenerating ? (
          <button
            className="btn-stop"
            onClick={stopGeneration}
          >
            <StopIcon />
            停止生成
          </button>
        ) : (
          <button
            className="btn-send"
            onClick={() => sendMessage(input)}
            disabled={!input.trim()}
          >
            <SendIcon />
            发送
          </button>
        )}
      </div>
    </div>
  );
}
```

---

## 🎯 关键要点

### 1. **用户意图标识**
```typescript
let userStoppedGeneration = false;  // 区分主动停止 vs 网络断开
```

### 2. **保存续传信息的条件**
```typescript
// ✅ 只在非用户主动停止时保存
if (!userStoppedGeneration) {
  sessionStorage.setItem('resumeInfo', ...);
}
```

### 3. **清除续传信息的时机**
```typescript
// 1. 用户点击"停止生成" → 清除
// 2. 生成完成 → 清除
// 3. 续传成功 → 清除
// 4. 用户放弃续传 → 清除
// 5. 续传信息过期 → 清除
```

### 4. **过期时间控制**
```typescript
const RESUME_TIMEOUT = 5 * 60 * 1000; // 5分钟
// 超过5分钟的续传信息视为无效
```

---

## 🧪 测试场景

### 场景 1: 用户主动停止
```
1. 用户发送消息
2. AI 开始生成（已生成 300 字）
3. 用户点击"停止生成"
4. ✅ 不保存续传信息
5. ✅ 下次发送新消息时，不会续传
```

### 场景 2: 网络波动
```
1. 用户发送消息
2. AI 开始生成（已生成 300 字）
3. 网络断开（onerror 触发）
4. ✅ 保存续传信息: { messageId, position: 300 }
5. 用户重新打开页面或重连
6. ✅ 显示"继续接收"提示
7. 用户点击"继续接收"
8. ✅ 从第 301 字继续接收
```

### 场景 3: 续传信息过期
```
1. 网络断开，保存续传信息
2. 10 分钟后用户重新打开页面
3. ✅ 检测到续传信息已过期（> 5 分钟）
4. ✅ 自动清除，不显示续传提示
```

---

## 📊 状态流转图

```
[发送消息] → [生成中]
                ↓
         [用户停止] ────→ [不保存续传信息] → [结束]
                ↓
         [网络断开] ────→ [保存续传信息] → [显示续传提示]
                                              ↓
                                    [用户选择: 继续/放弃]
                                              ↓
                              [继续] → [续传请求] → [结束]
                              [放弃] → [清除信息] → [结束]
```

---

## 🔐 安全考虑

1. **续传信息存储**
   - 使用 `sessionStorage`（不跨 Tab）
   - 按会话ID分别存储
   - 包含时间戳，自动过期

2. **过期时间**
   - 前端：5分钟
   - 后端 MongoDB TTL：30分钟
   - 前端更严格，避免无效请求

3. **用户隐私**
   - 不在 localStorage 存储（避免跨会话泄露）
   - 页面关闭后自动清除（sessionStorage特性）

---

## 🎉 总结

通过 `userStoppedGeneration` 标志和 `sessionStorage`，我们成功区分了：
- ✅ 用户主动停止 → 不续传
- ✅ 网络波动 → 自动续传

用户体验更好，不会在用户明确表示"不想要后续内容"时还继续推送。

