# 渐进式上传策略实施方案

## 🎯 策略概述

根据文本大小采用不同的上传策略，既保证效率又控制复杂度：

```
文本大小 <10KB      → 直接上传 (无需优化)
文本大小 10KB-5MB   → 压缩上传 (最优方案)
文本大小 5MB-10MB   → 压缩+分片 (极端场景)
文本大小 >10MB      → 警告用户 (超出合理范围)
```

---

## 📐 阈值设计

### 阈值定义

```typescript
// src/constants/uploadThresholds.ts (新建)

export const UPLOAD_THRESHOLDS = {
  // 直接上传阈值：10KB
  DIRECT_UPLOAD_MAX: 10 * 1024,
  
  // 压缩上传阈值：5MB
  COMPRESSION_MAX: 5 * 1024 * 1024,
  
  // 压缩后分片阈值：5MB
  COMPRESSED_CHUNK_THRESHOLD: 5 * 1024 * 1024,
  
  // 绝对上限：10MB
  ABSOLUTE_MAX: 10 * 1024 * 1024,
  
  // 分片大小：100KB
  CHUNK_SIZE: 100 * 1024,
} as const;

export const UPLOAD_WARNINGS = {
  LARGE_TEXT: '您的文本较大，正在使用压缩上传以加快速度...',
  VERY_LARGE_TEXT: '您的文本非常大，正在使用分片上传，可能需要等待...',
  TOO_LARGE: '文本过大（超过 10MB），建议您简化内容或分批发送。继续上传可能会失败或内容丢失。',
} as const;
```

### 阈值设计理由

| 阈值 | 原因 |
|------|------|
| **10KB** | HTTP 请求头本身约 1-2KB，10KB 文本序列化后约 12KB，上传 <100ms，无需优化 |
| **5MB** | 压缩后通常 <1MB，上传时间 <2 秒，用户体验良好 |
| **10MB** | 压缩后约 2MB，如果再大可能超过服务端限制，需要警告用户 |

---

## 🔄 上传策略流程图

```
用户点击发送
    ↓
检测文本大小
    ↓
    ├─ <10KB ────────────→ 直接上传
    │                      (无提示，立即完成)
    │
    ├─ 10KB-5MB ─────────→ 压缩上传
    │                      (提示：正在压缩...)
    │                      (0.5-2 秒完成)
    │
    ├─ 5MB-10MB ─────────→ 判断压缩后大小
    │                      │
    │                      ├─ 压缩后 <5MB ──→ 压缩上传
    │                      │                  (提示：正在压缩...)
    │                      │
    │                      └─ 压缩后 ≥5MB ──→ 压缩+分片
    │                                         (提示：文本很大，正在分片上传...)
    │                                         (显示进度条)
    │
    └─ >10MB ────────────→ 警告用户
                           (弹窗：文本过大，建议简化)
                           │
                           ├─ 用户选择 "简化" ──→ 返回编辑
                           │
                           └─ 用户选择 "强制上传" ──→ 压缩+分片
                                                       (显示风险提示)
```

---

## 💻 实施方案

### 阶段 1: 基础架构（必须）

#### 1.1 上传策略选择器

```typescript
// src/utils/uploadStrategy.ts (新建)

import { UPLOAD_THRESHOLDS, UPLOAD_WARNINGS } from '../constants/uploadThresholds';

export type UploadStrategy = 
  | 'direct'          // 直接上传
  | 'compression'     // 压缩上传
  | 'chunking'        // 分片上传（已压缩）
  | 'too-large';      // 超出限制

export interface UploadDecision {
  strategy: UploadStrategy;
  warning?: string;
  estimatedTime?: number;  // 预估上传时间（秒）
  requiresConfirmation: boolean;  // 是否需要用户确认
}

/**
 * 决定上传策略
 */
export function selectUploadStrategy(text: string): UploadDecision {
  const size = text.length;
  
  // 1. 小文本：直接上传
  if (size < UPLOAD_THRESHOLDS.DIRECT_UPLOAD_MAX) {
    return {
      strategy: 'direct',
      estimatedTime: 0.1,
      requiresConfirmation: false,
    };
  }
  
  // 2. 超大文本：警告
  if (size > UPLOAD_THRESHOLDS.ABSOLUTE_MAX) {
    return {
      strategy: 'too-large',
      warning: UPLOAD_WARNINGS.TOO_LARGE,
      estimatedTime: estimateUploadTime(size, 'chunking'),
      requiresConfirmation: true,
    };
  }
  
  // 3. 中等文本：压缩上传
  if (size < UPLOAD_THRESHOLDS.COMPRESSION_MAX) {
    return {
      strategy: 'compression',
      warning: UPLOAD_WARNINGS.LARGE_TEXT,
      estimatedTime: estimateUploadTime(size, 'compression'),
      requiresConfirmation: false,
    };
  }
  
  // 4. 大文本：需要进一步判断
  // 这里我们先假设压缩率 70%，预判是否需要分片
  const estimatedCompressedSize = size * 0.3;
  
  if (estimatedCompressedSize < UPLOAD_THRESHOLDS.COMPRESSED_CHUNK_THRESHOLD) {
    return {
      strategy: 'compression',
      warning: UPLOAD_WARNINGS.LARGE_TEXT,
      estimatedTime: estimateUploadTime(size, 'compression'),
      requiresConfirmation: false,
    };
  }
  
  // 5. 压缩后仍然很大：分片上传
  return {
    strategy: 'chunking',
    warning: UPLOAD_WARNINGS.VERY_LARGE_TEXT,
    estimatedTime: estimateUploadTime(size, 'chunking'),
    requiresConfirmation: false,
  };
}

/**
 * 预估上传时间（基于网络速度）
 */
function estimateUploadTime(size: number, strategy: UploadStrategy): number {
  // 假设平均网络速度：500 KB/s (4G)
  const networkSpeed = 500 * 1024;  // bytes/s
  
  switch (strategy) {
    case 'direct':
      return size / networkSpeed;
    
    case 'compression':
      // 压缩后约 30% 大小，加上压缩时间
      const compressedSize = size * 0.3;
      const compressionTime = size / (5 * 1024 * 1024);  // 5MB/s 压缩速度
      return compressionTime + compressedSize / networkSpeed;
    
    case 'chunking':
      // 压缩 + 分片上传（有额外开销）
      const compressedChunkSize = size * 0.3;
      const chunks = Math.ceil(compressedChunkSize / UPLOAD_THRESHOLDS.CHUNK_SIZE);
      const perChunkOverhead = 0.15;  // 每片 150ms 开销
      return (size / (5 * 1024 * 1024)) + 
             (compressedChunkSize / networkSpeed) + 
             (chunks * perChunkOverhead);
    
    default:
      return 0;
  }
}

/**
 * 格式化文件大小显示
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 格式化时间显示
 */
export function formatTime(seconds: number): string {
  if (seconds < 1) return '不到 1 秒';
  if (seconds < 60) return `约 ${Math.round(seconds)} 秒`;
  return `约 ${Math.round(seconds / 60)} 分钟`;
}
```

#### 1.2 用户确认对话框组件

```typescript
// src/components/UploadConfirmDialog.tsx (新建)

import React from 'react';
import './UploadConfirmDialog.css';

interface UploadConfirmDialogProps {
  textSize: number;
  estimatedTime: number;
  warning: string;
  onConfirm: () => void;
  onCancel: () => void;
  onSimplify: () => void;
}

export const UploadConfirmDialog: React.FC<UploadConfirmDialogProps> = ({
  textSize,
  estimatedTime,
  warning,
  onConfirm,
  onCancel,
  onSimplify,
}) => {
  return (
    <div className="upload-confirm-overlay">
      <div className="upload-confirm-dialog">
        <div className="dialog-icon warning">⚠️</div>
        
        <h3>文本过大警告</h3>
        
        <div className="dialog-content">
          <p>{warning}</p>
          
          <div className="text-info">
            <div className="info-item">
              <span className="label">文本大小：</span>
              <span className="value">{formatSize(textSize)}</span>
            </div>
            <div className="info-item">
              <span className="label">预计上传时间：</span>
              <span className="value">{formatTime(estimatedTime)}</span>
            </div>
          </div>
          
          <div className="risk-notice">
            <strong>风险提示：</strong>
            <ul>
              <li>上传时间较长，可能因网络中断导致失败</li>
              <li>超大文本可能影响模型处理效果</li>
              <li>建议您精简内容或分批发送</li>
            </ul>
          </div>
        </div>
        
        <div className="dialog-actions">
          <button 
            className="btn btn-secondary"
            onClick={onCancel}
          >
            取消
          </button>
          
          <button 
            className="btn btn-primary"
            onClick={onSimplify}
          >
            返回精简
          </button>
          
          <button 
            className="btn btn-danger"
            onClick={onConfirm}
          >
            强制上传
          </button>
        </div>
      </div>
    </div>
  );
};
```

```css
/* src/components/UploadConfirmDialog.css (新建) */

.upload-confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.upload-confirm-dialog {
  background: white;
  border-radius: 12px;
  padding: 24px;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.dialog-icon.warning {
  font-size: 48px;
  text-align: center;
  margin-bottom: 16px;
}

.upload-confirm-dialog h3 {
  margin: 0 0 16px 0;
  text-align: center;
  color: #d97706;
}

.dialog-content {
  margin-bottom: 24px;
}

.text-info {
  background: #f3f4f6;
  border-radius: 8px;
  padding: 12px;
  margin: 16px 0;
}

.info-item {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
}

.info-item .label {
  color: #6b7280;
}

.info-item .value {
  font-weight: 600;
  color: #111827;
}

.risk-notice {
  background: #fef3c7;
  border-left: 4px solid #f59e0b;
  padding: 12px;
  border-radius: 4px;
  margin-top: 16px;
}

.risk-notice strong {
  color: #d97706;
  display: block;
  margin-bottom: 8px;
}

.risk-notice ul {
  margin: 0;
  padding-left: 20px;
  color: #92400e;
}

.risk-notice li {
  margin: 4px 0;
}

.dialog-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary {
  background: #e5e7eb;
  color: #374151;
}

.btn-secondary:hover {
  background: #d1d5db;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover {
  background: #2563eb;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-danger:hover {
  background: #dc2626;
}
```

#### 1.3 集成到主发送流程

```typescript
// src/hooks/data/useSSEStream.ts (修改)

import { selectUploadStrategy, formatSize, formatTime } from '../../utils/uploadStrategy';
import { compressText, isCompressionSupported } from '../../utils/compression';
import { ChunkUploader } from '../../utils/chunkUploader';
import { UploadConfirmDialog } from '../../components/UploadConfirmDialog';

export function useSSEStream(options: UseSSEStreamOptions = {}) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{
    text: string;
    decision: UploadDecision;
  } | null>(null);
  
  // ...
  
  const sendMessage = async (
    messageText: string,
    userMessageId: string,
    assistantMessageId: string,
    messageCountRefs?: React.MutableRefObject<Map<string, HTMLElement>>
  ) => {
    try {
      abortControllerRef.current = new AbortController();
      
      // ✅ 步骤 1: 决定上传策略
      const decision = selectUploadStrategy(messageText);
      
      console.log(`📊 [上传策略] 文本大小: ${formatSize(messageText.length)}, 策略: ${decision.strategy}`);
      
      // ✅ 步骤 2: 如果需要用户确认
      if (decision.requiresConfirmation) {
        setPendingUpload({ text: messageText, decision });
        setShowConfirmDialog(true);
        
        // 等待用户确认
        return new Promise((resolve, reject) => {
          // 这里需要通过 state 或 event 处理用户选择
          // 暂时简化处理
        });
      }
      
      // ✅ 步骤 3: 显示提示信息
      if (decision.warning) {
        updateMessage(assistantMessageId, {
          thinking: decision.warning,
        });
      }
      
      // ✅ 步骤 4: 执行上传
      await executeUpload(
        messageText,
        decision,
        userMessageId,
        assistantMessageId,
        messageCountRefs
      );
      
    } catch (error: any) {
      // 错误处理...
    }
  };
  
  /**
   * 执行上传（根据策略）
   */
  const executeUpload = async (
    messageText: string,
    decision: UploadDecision,
    userMessageId: string,
    assistantMessageId: string,
    messageCountRefs?: React.MutableRefObject<Map<string, HTMLElement>>
  ) => {
    let requestBody: any;
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: string | FormData;
    
    switch (decision.strategy) {
      case 'direct':
        // 直接上传
        requestBody = {
          message: messageText,
          userId,
          conversationId,
          // ...其他参数
        };
        body = JSON.stringify(requestBody);
        break;
      
      case 'compression':
        // 压缩上传
        updateMessage(assistantMessageId, {
          thinking: '正在压缩文本...',
        });
        
        const compressed = await compressText(messageText);
        
        updateMessage(assistantMessageId, {
          thinking: `压缩完成 (${formatSize(messageText.length)} → ${formatSize(compressed.size)})，正在上传...`,
        });
        
        const formData = new FormData();
        formData.append('metadata', JSON.stringify({
          userId,
          conversationId,
          isCompressed: true,
          // ...其他参数
        }));
        formData.append('message', compressed);
        
        body = formData;
        headers = {};  // FormData 会自动设置 Content-Type
        break;
      
      case 'chunking':
        // 分片上传
        updateMessage(assistantMessageId, {
          thinking: '正在压缩并分片上传...',
        });
        
        // 先压缩
        const compressedForChunking = await compressText(messageText);
        
        // 分片上传
        const sessionId = await ChunkUploader.uploadLargeBlob(
          compressedForChunking,
          userId,
          (percent) => {
            updateMessage(assistantMessageId, {
              thinking: `上传中... ${percent}%`,
            });
          }
        );
        
        requestBody = {
          uploadSessionId: sessionId,
          userId,
          conversationId,
          isCompressed: true,
          // ...其他参数
        };
        body = JSON.stringify(requestBody);
        break;
      
      case 'too-large':
        // 用户确认后的强制上传（同 chunking）
        // 这个分支不应该被执行到，因为 too-large 会触发确认对话框
        throw new Error('文本过大，需要用户确认');
      
      default:
        throw new Error(`未知的上传策略: ${decision.strategy}`);
    }
    
    // 发送请求
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers,
      body,
      signal: abortControllerRef.current?.signal,
    });
    
    // 后续 SSE 流处理...
  };
  
  // ✅ 用户确认对话框的处理
  const handleUploadConfirm = async () => {
    if (!pendingUpload) return;
    
    setShowConfirmDialog(false);
    
    // 强制使用分片上传
    const forcedDecision: UploadDecision = {
      strategy: 'chunking',
      warning: '正在强制上传，请耐心等待...',
      estimatedTime: pendingUpload.decision.estimatedTime,
      requiresConfirmation: false,
    };
    
    await executeUpload(
      pendingUpload.text,
      forcedDecision,
      /* 其他参数 */
    );
    
    setPendingUpload(null);
  };
  
  const handleUploadCancel = () => {
    setShowConfirmDialog(false);
    setPendingUpload(null);
    // 清理消息或显示取消提示
  };
  
  const handleUploadSimplify = () => {
    setShowConfirmDialog(false);
    setPendingUpload(null);
    // 返回输入框，让用户精简内容
    // 可以通过回调通知父组件
  };
  
  return {
    sendMessage,
    abort,
    // ✅ 导出对话框相关
    showConfirmDialog,
    pendingUpload,
    handleUploadConfirm,
    handleUploadCancel,
    handleUploadSimplify,
  };
}
```

---

### 阶段 2: 压缩功能（第一优先级）

这部分已在之前的文档中详细说明，包括：
- `src/utils/compression.ts`
- `api/lambda/chat.ts` 解压逻辑

**预计工作量**：1-2 天

---

### 阶段 3: 分片功能（第二优先级，可选）

这部分只在监控数据显示需要时才实施。

#### 3.1 前端分片上传器（简化版）

```typescript
// src/utils/chunkUploader.ts (新建，仅在需要时)

export class ChunkUploader {
  private static readonly CHUNK_SIZE = 100 * 1024; // 100KB
  
  /**
   * 上传已压缩的 Blob（分片）
   */
  static async uploadLargeBlob(
    blob: Blob,
    userId: string,
    onProgress?: (percent: number) => void
  ): Promise<string> {
    // 如果小于 100KB，直接上传
    if (blob.size < this.CHUNK_SIZE) {
      return await this.uploadSmallBlob(blob, userId);
    }
    
    // 1. 读取 Blob 为 ArrayBuffer
    const buffer = await blob.arrayBuffer();
    const chunks: Blob[] = [];
    
    for (let i = 0; i < buffer.byteLength; i += this.CHUNK_SIZE) {
      const chunk = buffer.slice(i, i + this.CHUNK_SIZE);
      chunks.push(new Blob([chunk]));
    }
    
    console.log(`📤 [分片] 切分为 ${chunks.length} 片`);
    
    // 2. 创建上传会话
    const sessionId = await this.createSession(userId, chunks.length);
    
    // 3. 上传每一片
    for (let i = 0; i < chunks.length; i++) {
      await this.uploadChunkWithRetry(sessionId, i, chunks[i], 3);
      
      const percent = Math.round(((i + 1) / chunks.length) * 100);
      onProgress?.(percent);
    }
    
    // 4. 完成上传
    await this.completeSession(sessionId);
    
    return sessionId;
  }
  
  /**
   * 小 Blob 直接上传
   */
  private static async uploadSmallBlob(blob: Blob, userId: string): Promise<string> {
    const formData = new FormData();
    formData.append('userId', userId);
    formData.append('blob', blob);
    
    const response = await fetch('/api/upload/direct', {
      method: 'POST',
      body: formData,
    });
    
    const data = await response.json();
    return data.sessionId;
  }
  
  // ... 其他方法（创建会话、上传分片、重试逻辑等）
}
```

**预计工作量**：3-5 天（仅在需要时实施）

---

## 📊 改动规模评估

### 阶段 1: 基础架构（必须实施）

| 文件 | 类型 | 代码量 | 说明 |
|------|------|--------|------|
| `src/constants/uploadThresholds.ts` | 新建 | 30 行 | 阈值配置 |
| `src/utils/uploadStrategy.ts` | 新建 | 150 行 | 策略选择器 |
| `src/components/UploadConfirmDialog.tsx` | 新建 | 100 行 | 确认对话框 |
| `src/components/UploadConfirmDialog.css` | 新建 | 120 行 | 样式 |
| `src/hooks/data/useSSEStream.ts` | 修改 | +100 行 | 集成策略 |
| **小计** | - | **~500 行** | - |

**工作量**：2-3 天

---

### 阶段 2: 压缩功能（第一优先级）

| 文件 | 类型 | 代码量 | 说明 |
|------|------|--------|------|
| `src/utils/compression.ts` | 新建 | 50 行 | 前端压缩 |
| `src/hooks/data/useSSEStream.ts` | 修改 | +50 行 | 集成压缩 |
| `api/lambda/chat.ts` | 修改 | +80 行 | 后端解压 |
| **小计** | - | **~180 行** | - |

**工作量**：1-2 天

---

### 阶段 3: 分片功能（第二优先级，可选）

| 文件 | 类型 | 代码量 | 说明 |
|------|------|--------|------|
| `src/utils/chunkUploader.ts` | 新建 | 250 行 | 前端分片上传 |
| `api/lambda/upload.ts` | 新建 | 200 行 | 后端接收分片 |
| `api/lambda/chat.ts` | 修改 | +30 行 | 读取分片结果 |
| **小计** | - | **~480 行** | - |

**工作量**：3-5 天（仅在需要时实施）

---

## 📅 实施时间表

### 第 1 周：基础架构 + 压缩功能

```
Day 1-2: 基础架构
  - 阈值配置
  - 策略选择器
  - 确认对话框

Day 3-4: 压缩功能
  - 前端压缩
  - 后端解压
  - 集成测试

Day 5: 测试优化
  - 端到端测试
  - 性能测试
  - UI/UX 优化
```

**产出**：
- ✅ 支持小文本直接上传
- ✅ 支持中等文本压缩上传
- ✅ 大文本警告用户
- ⚠️ 暂不支持分片（用户强制上传时降级到压缩上传）

---

### 第 2-4 周：监控观察

```
监控指标：
- 上传失败率（按文本大小分段）
- P95/P99 上传时间
- 用户强制上传的频率
- 强制上传的失败率
```

**决策依据**：
```
if (强制上传频率 < 1% 且 失败率 < 10%):
    ✅ 不需要实施分片
elif (强制上传频率 > 5% 或 失败率 > 20%):
    ⚠️ 考虑实施分片
else:
    ✅ 继续观察
```

---

### 第 5 周起：按需实施分片

仅在数据驱动的决策下实施。

---

## 📈 总改动量

### 最小实施（基础 + 压缩）

```
新增文件：5 个
修改文件：2 个
新增代码：~680 行
新增 API：0 个
需要 Redis：❌

预计工作量：3-5 天
```

### 完整实施（包含分片）

```
新增文件：7 个
修改文件：3 个
新增代码：~1,160 行
新增 API：3 个 (upload/session, upload/chunk, upload/complete)
需要 Redis：✅

预计工作量：6-10 天
```

---

## 🎯 推荐路线

### 立即实施（第 1 周）

```
✅ 基础架构（策略选择、确认对话框）
✅ 压缩功能（前后端）
✅ 小文本直接上传
✅ 大文本警告
```

**收益**：
- 解决 95% 的场景
- 用户有明确的反馈和选择
- 为未来扩展留下接口

---

### 观察期（第 2-4 周）

```
📊 监控数据
📊 收集用户反馈
📊 评估是否需要分片
```

---

### 按需实施（第 5 周起）

```
⚠️ 仅在数据驱动下实施分片
```

---

## 💡 关键优势

### 1. 渐进式复杂度

```
阶段 1: 简单策略 (3-5 天)
  ↓ 满足需求就停止
阶段 2: 观察数据 (2-4 周)
  ↓ 有需求才继续
阶段 3: 复杂方案 (3-5 天)
```

不是一次性投入 10 天，而是分阶段投入。

---

### 2. 用户感知优化

```
小文本：无感知 (快速)
中文本：有提示 (知道在优化)
大文本：有警告 (知道风险)
超大文本：必须确认 (明确选择)
```

用户始终有清晰的反馈。

---

### 3. 风险控制

```
超大文本：
1. 警告用户风险
2. 提供"返回精简"选项
3. 允许"强制上传"
4. 明确告知可能失败
```

避免用户投入大量时间后失败。

---

### 4. 数据驱动

```
不是靠猜测，而是靠数据：
- 监控失败率
- 监控上传时间
- 监控用户行为

数据说话，决定是否需要分片。
```

---

## 🧪 测试计划

### 单元测试

```typescript
// test/unit/uploadStrategy.test.ts

describe('selectUploadStrategy', () => {
  test('小文本(<10KB) 应该直接上传', () => {
    const text = 'a'.repeat(5 * 1024);
    const decision = selectUploadStrategy(text);
    expect(decision.strategy).toBe('direct');
    expect(decision.requiresConfirmation).toBe(false);
  });
  
  test('中文本(10KB-5MB) 应该压缩上传', () => {
    const text = 'a'.repeat(500 * 1024);
    const decision = selectUploadStrategy(text);
    expect(decision.strategy).toBe('compression');
    expect(decision.warning).toBeDefined();
  });
  
  test('大文本(5MB-10MB) 应该压缩后判断', () => {
    const text = 'a'.repeat(7 * 1024 * 1024);
    const decision = selectUploadStrategy(text);
    // 压缩率约 70%，7MB * 0.3 = 2.1MB < 5MB
    expect(decision.strategy).toBe('compression');
  });
  
  test('超大文本(>10MB) 应该警告', () => {
    const text = 'a'.repeat(12 * 1024 * 1024);
    const decision = selectUploadStrategy(text);
    expect(decision.strategy).toBe('too-large');
    expect(decision.requiresConfirmation).toBe(true);
  });
});
```

### 集成测试

```javascript
// test/integration/upload.test.js

describe('上传流程', () => {
  test('小文本直接上传', async () => {
    const text = 'Hello World';
    const response = await uploadText(text);
    expect(response.status).toBe(200);
  });
  
  test('中文本压缩上传', async () => {
    const text = 'a'.repeat(500 * 1024);
    const response = await uploadText(text);
    expect(response.headers.get('X-Compression-Used')).toBe('true');
  });
  
  test('超大文本被拒绝（未确认）', async () => {
    const text = 'a'.repeat(12 * 1024 * 1024);
    const response = await uploadText(text, { skipConfirmation: true });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('需要用户确认');
  });
});
```

---

## 📝 总结

### 渐进式策略的优势

1. **最小实施（3-5 天）**：
   - 解决 95% 场景
   - 代码量 ~680 行
   - 无需 Redis
   - 低风险

2. **观察数据（2-4 周）**：
   - 了解真实需求
   - 数据驱动决策
   - 避免过度设计

3. **按需扩展（3-5 天）**：
   - 只在必要时实施分片
   - 已有基础架构
   - 扩展成本低

### 总改动规模

**最小方案**：
- 新增/修改文件：7 个
- 新增代码：~680 行
- 工作量：3-5 天

**完整方案**（如需分片）：
- 新增/修改文件：10 个
- 新增代码：~1,160 行
- 工作量：6-10 天

### 关键收益

- ✅ 用户有清晰的反馈和选择
- ✅ 风险可控（警告机制）
- ✅ 性能优化（压缩）
- ✅ 可扩展（渐进式）
- ✅ 数据驱动（不过度设计）

---

**作者**: AI Assistant  
**日期**: 2024-12-30  
**版本**: 1.0.0

