# 共享 Hooks

本目录仅存放**被多个组件使用**的通用 hooks。单消费者 hooks 已就近放置到各自组件目录的 `hooks/` 子目录下。

## 目录结构

```
src/hooks/                         ← 共享 hooks（多消费者）
├── useThrottle.ts                 ← 4 处使用
├── useDateFormat.ts               ← 2 处使用
├── useAutoResizeTextarea.ts       ← 通用性强
├── useEventListener.ts            ← 基础设施
├── index.ts                       ← 统一导出
└── README.md

src/components/business/Chat/
├── hooks/                         ← ChatInterface 专用 hooks
│   ├── useSSEStream/              ← SSE 流式请求
│   ├── useMessageSender.ts        ← 消息发送
│   ├── useMessageQueue.ts         ← 消息队列
│   ├── useConversationManager.ts  ← 对话管理
│   ├── useChatInitialization.ts   ← 聊天初始化
│   ├── useCrossTabSync.ts         ← 跨 Tab 同步
│   └── usePerfMock.ts             ← 性能 Mock

src/components/business/Message/
├── hooks/                         ← Message 专用 hooks
│   ├── useProgressiveLoad.ts      ← 渐进式加载
│   └── useWorkerMarkdownParse.ts  ← Worker Markdown 解析
```

## 导入方式

```tsx
// 共享 hooks：从顶层导入
import { useThrottle, useDateFormat } from '@/hooks';

// 专用 hooks：从组件目录就近导入
import { useMessageSender } from './hooks/useMessageSender';
```

## 放置原则

| 使用范围 | 放置位置 |
|----------|----------|
| 单组件专用 | 组件同目录 `hooks/` 子目录 |
| 2+ 组件共享 | `src/hooks/` |
| 基础设施 | `src/hooks/` |

详见 `docs/01-Architecture-Refactoring/convergence-refactroing-frontend/HOOKS_COLOCATION_STRATEGY.md`。
