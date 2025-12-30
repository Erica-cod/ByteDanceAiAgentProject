# 旧组件结构

本文件夹包含重构前的原始组件文件，保留用于向后兼容和参考。

## 📁 内容

这些是重构前的组件文件：

### 核心组件
- `ChatInterface.tsx` - 旧的聊天界面（已有重构版：`business/Chat/ChatInterfaceRefactored.tsx`）
- `MessageList.tsx` - 旧的消息列表（已有重构版：`business/Message/MessageListRefactored.tsx`）
- `ProgressiveMessage.tsx` - 旧的渐进式消息（已有重构版：`business/Message/ProgressiveMessageRefactored.tsx`）

### 其他组件
- `ConversationList.tsx` - 对话列表
- `SettingsPanel.tsx` - 设置面板
- `StreamingMarkdown.tsx` - Markdown渲染
- `MultiAgentDisplay.tsx` - 多Agent显示
- `TextStatsIndicator.tsx` - 文本统计指示器
- `PlanCard.tsx` - 计划卡片
- `PlanListCard.tsx` - 计划列表卡片
- `VirtualList.tsx` - 虚拟列表

## ⚠️ 注意事项

1. **向后兼容**：这些组件仍然可以通过统一导出使用：
   ```typescript
   import { ChatInterface, MessageList } from '@/components';
   ```

2. **不推荐直接引用**：请使用统一导出，而不是直接从 `old-structure/` 导入。

3. **逐步迁移**：
   - ✅ 新功能：使用重构后的组件（`base/` 和 `business/`）
   - 🔄 现有功能：保持使用旧组件，逐步迁移
   - 📝 测试充分后，可逐步删除不再使用的旧组件

## 🚀 迁移建议

### 立即可用的重构版
1. **ProgressiveMessageRefactored** → 替代 `ProgressiveMessage`
2. **ChatInterfaceRefactored** → 替代 `ChatInterface`
3. **MessageListRefactored** → 替代 `MessageList`

### 迁移示例

**旧代码：**
```typescript
import { ProgressiveMessage } from '@/components';

<ProgressiveMessage content={...} />
```

**新代码：**
```typescript
import { ProgressiveMessageRefactored } from '@/components';

<ProgressiveMessageRefactored
  messageId={message.id}
  userId={userId}
  initialContent={message.content}
  totalLength={message.contentLength}
/>
```

## 📊 重构对比

| 组件 | 旧版本 | 重构版本 | 优势 |
|------|--------|----------|------|
| ProgressiveMessage | 单体组件 | Hook + 基础UI | 逻辑分离，可测试 |
| ChatInterface | 200+行 | 130行 | 使用组合，更简洁 |
| MessageList | 混杂渲染 | MessageItemRenderer | 职责清晰 |

## 🗂️ 未来计划

- **短期（1-2周）**：测试重构版，收集反馈
- **中期（1-2月）**：逐步迁移现有功能
- **长期（3-6月）**：删除不再使用的旧组件

---

**重构日期**：2024-12-30  
**保留原因**：向后兼容、渐进式迁移  
**生命周期**：待所有功能迁移完成后删除

