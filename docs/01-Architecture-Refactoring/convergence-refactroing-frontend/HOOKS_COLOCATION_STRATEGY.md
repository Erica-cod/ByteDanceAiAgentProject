# Hooks 就近放置策略：从集中式目录到特性共置

## 一、问题背景

### 1.1 现状

经过前几轮架构重构（路径别名、类型治理、大文件拆分、CSS Modules 迁移、死代码清理），`src/hooks/` 目录已收敛为 13 个 hook，按三层分类组织：

```
src/hooks/
├── data/                          # 数据层
│   ├── useSSEStream/              # SSE 流式请求（含子模块）
│   ├── useMessageSender.ts        # 消息发送
│   ├── useMessageQueue.ts         # 消息队列管理
│   ├── useConversationManager.ts  # 对话生命周期
│   ├── useChatInitialization.ts   # 聊天初始化（userId/deviceId）
│   ├── useCrossTabSync.ts         # 跨 Tab 同步
│   ├── usePerfMock.ts             # 性能 Mock（开发环境）
│   ├── useProgressiveLoad.ts      # 渐进式加载
│   └── useWorkerMarkdownParse.ts  # Worker Markdown 解析
├── interaction/                   # 交互层
│   └── useThrottle.ts             # 节流
└── utils/                         # 工具层
    ├── useDateFormat.ts           # 日期格式化
    ├── useAutoResizeTextarea.ts   # 文本框自适应高度
    └── useEventListener.ts        # 事件监听（防闭包泄漏）
```

### 1.2 问题：集中式目录 ≠ 共享代码

分类虽合理，但审查消费者分布后发现一个关键矛盾——**大多数 hook 只有单一消费者**，被放在 `src/hooks/` 却暗示了"共享"的语义：

| Hook | 消费者数 | 唯一消费者 |
|------|----------|------------|
| `useSSEStream` | 1 | `useMessageSender.ts`（hooks 内部） |
| `useMessageSender` | 1 | `ChatInterface.tsx` |
| `useMessageQueue` | 1 | `ChatInterface.tsx` |
| `useConversationManager` | 1 | `ChatInterface.tsx` |
| `useChatInitialization` | 1 | `ChatInterface.tsx` |
| `useCrossTabSync` | 1 | `ChatInterface.tsx` |
| `usePerfMock` | 1 | `ChatInterface.tsx` |
| `useProgressiveLoad` | 1 | `ProgressiveMessage.tsx` |
| `useWorkerMarkdownParse` | 1 | `ChunkRenderer.tsx` |
| `useAutoResizeTextarea` | 1 | `ChatInputArea.tsx` |
| **`useThrottle`** | **4** | **多组件共享 ✓** |
| **`useDateFormat`** | **2** | **多组件共享 ✓** |
| `useEventListener` | 0 | 基础设施，被 `useCrossTabSync` 间接使用 |

**13 个 hook 中，仅 2 个（`useThrottle`、`useDateFormat`）是真正的多消费者共享 hook。**

### 1.3 带来的问题

1. **语义误导**：新开发者看到 `src/hooks/data/useChatInitialization.ts` 会以为它是一个跨组件共享的 hook，实际上它只服务于 `ChatInterface`
2. **目录膨胀**：`hooks/data/` 下 9 个文件，其中 7 个专属于同一个组件，目录层级并没有提供额外的组织价值
3. **心智负担**：修改 `ChatInterface` 时需要在 `components/business/Chat/` 和 `hooks/data/` 两处来回跳转，增加认知开销
4. **职责边界模糊**：分类目录（data/interaction/utils）的设计初衷是为共享 hook 提供导航，当大部分成员都是单消费者时，分类失去意义

---

## 二、方案设计

### 2.1 社区调研

查阅了 React 社区在 hook 组织策略上的主流观点：

#### Kent C. Dodds — Colocation 原则

> "Place code as close to where it's relevant as possible."
> 
> — [Colocation (kentcdodds.com)](https://kentcdodds.com/blog/colocation)

核心主张：代码的放置位置应该与使用位置尽可能接近。只有当代码被多个模块共享时，才应向上提升到公共目录。

#### React 官方文档

React 文档中的自定义 hook 示例通常将 hook 定义在使用它的组件同级或附近，并没有推荐统一的顶层 `hooks/` 目录。

#### 社区共识

综合 Reddit、Stack Overflow、Dev.to 上的讨论，社区对 hook 组织的主流建议是**分级策略**：

| 使用范围 | 放置位置 | 示例 |
|----------|----------|------|
| 单组件专用 | 组件同目录或 `hooks/` 子目录 | `Chat/hooks/useMessageSender.ts` |
| 特性内共享 | 特性目录下的 `hooks/` | `features/chat/hooks/useThrottle.ts` |
| 全局共享 | `src/hooks/` 顶层目录 | `src/hooks/useThrottle.ts` |

#### Bulletproof React

[Bulletproof React](https://github.com/alan2207/bulletproof-react) 项目模板（17k+ stars）推荐按特性（feature）组织代码，每个特性目录下包含自己的 `hooks/`、`components/`、`types/`：

```
src/features/
├── chat/
│   ├── components/
│   ├── hooks/          ← 特性专用 hooks
│   ├── types/
│   └── utils/
└── auth/
    ├── components/
    ├── hooks/
    └── ...
```

### 2.2 判断标准

结合调研结果，我们确定 hook 放置位置的判断标准：

```
                    这个 hook 被多少个组件使用？
                           │
               ┌───────────┼───────────┐
               │           │           │
            0-1 个       2-3 个      4+ 个
               │           │           │
          就近放置     看情况提升    放入共享目录
        (colocation)  (按关联度)   (src/hooks/)
```

- **0-1 个消费者**：放在消费者同目录或其 `hooks/` 子目录
- **2-3 个消费者**：如果消费者在同一特性内，放特性目录；如果跨特性，提升到 `src/hooks/`
- **4+ 个消费者**：放 `src/hooks/`，这是真正的共享基础设施

### 2.3 方案对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| **A. 维持现状** | 不需改动；分类目录可当索引 | 语义误导；修改时来回跳转 |
| **B. 全部就近放置** | 完全消除误导；修改闭环 | `useAutoResizeTextarea` 这样通用性强的 hook 被埋在组件目录不易发现 |
| **C. 分级策略（推荐）** | 共享的留顶层、专用的就近放；兼顾发现性和内聚性 | 需要迁移文件和更新导入 |

**选择方案 C**：对单消费者 hook 做就近放置，对多消费者 / 通用性强的 hook 保留在 `src/hooks/`。

---

## 三、实现细节

### 3.1 改后目录结构

```
src/hooks/                           ← 只放真正共享的 hooks
├── useThrottle.ts                   ← 4 处使用，纯通用工具
├── useDateFormat.ts                 ← 2 处使用，纯通用工具
├── useAutoResizeTextarea.ts         ← 1 处使用，但通用性极强，适合保留
├── useEventListener.ts              ← 基础设施，防闭包泄漏的底层工具
└── index.ts

src/components/business/Chat/
├── ChatInterface.tsx
├── hooks/                           ← ChatInterface 专用 hooks
│   ├── useMessageSender.ts
│   ├── useMessageQueue.ts
│   ├── useConversationManager.ts
│   ├── useChatInitialization.ts
│   ├── useCrossTabSync.ts
│   ├── usePerfMock.ts
│   └── useSSEStream/               ← 仅被 useMessageSender 调用
│       ├── index.ts
│       ├── request-builder.ts
│       ├── event-dispatcher.ts
│       ├── multi-agent-handlers.ts
│       ├── chunking-handlers.ts
│       └── types.ts
├── ChatInputArea.tsx
├── ConversationList.tsx
├── ...

src/components/business/Message/
├── ProgressiveMessage.tsx
├── hooks/
│   └── useProgressiveLoad.ts        ← 仅被 ProgressiveMessage 使用
├── ChunkRenderer.tsx
├── hooks/
│   └── useWorkerMarkdownParse.ts    ← 仅被 ChunkRenderer 使用
├── ...
```

### 3.2 迁移映射表

| Hook | 原路径 | 新路径 | 迁移原因 |
|------|--------|--------|----------|
| `useMessageSender` | `hooks/data/` | `components/business/Chat/hooks/` | 仅 ChatInterface 使用 |
| `useMessageQueue` | `hooks/data/` | `components/business/Chat/hooks/` | 仅 ChatInterface 使用 |
| `useConversationManager` | `hooks/data/` | `components/business/Chat/hooks/` | 仅 ChatInterface 使用 |
| `useChatInitialization` | `hooks/data/` | `components/business/Chat/hooks/` | 仅 ChatInterface 使用 |
| `useCrossTabSync` | `hooks/data/` | `components/business/Chat/hooks/` | 仅 ChatInterface 使用 |
| `usePerfMock` | `hooks/data/` | `components/business/Chat/hooks/` | 仅 ChatInterface 使用 |
| `useSSEStream/` | `hooks/data/useSSEStream/` | `components/business/Chat/hooks/useSSEStream/` | 仅被 useMessageSender 调用 |
| `useProgressiveLoad` | `hooks/data/` | `components/business/Message/hooks/` | 仅 ProgressiveMessage 使用 |
| `useWorkerMarkdownParse` | `hooks/data/` | `components/business/Message/hooks/` | 仅 ChunkRenderer 使用 |
| `useThrottle` | `hooks/interaction/` | `hooks/`（保留，扁平化） | 4 处使用 |
| `useDateFormat` | `hooks/utils/` | `hooks/`（保留，扁平化） | 2 处使用 |
| `useAutoResizeTextarea` | `hooks/utils/` | `hooks/`（保留，扁平化） | 通用性强 |
| `useEventListener` | `hooks/utils/` | `hooks/`（保留，扁平化） | 基础设施 |

### 3.3 附带改进：消除 data/interaction/utils 子目录

保留在 `src/hooks/` 的只有 4 个文件，继续维持三层分类（data/interaction/utils）已无意义。扁平化后更简洁：

```
# 改前
src/hooks/interaction/useThrottle.ts
src/hooks/utils/useDateFormat.ts

# 改后
src/hooks/useThrottle.ts
src/hooks/useDateFormat.ts
```

### 3.4 导入路径变化示例

```typescript
// ChatInterface.tsx — 改前
import { useMessageSender, useMessageQueue, useConversationManager } from '@/hooks';
import { useChatInitialization, useCrossTabSync, usePerfMock } from '@/hooks/data';

// ChatInterface.tsx — 改后
import { useMessageSender } from './hooks/useMessageSender';
import { useMessageQueue } from './hooks/useMessageQueue';
import { useConversationManager } from './hooks/useConversationManager';
import { useChatInitialization } from './hooks/useChatInitialization';
import { useCrossTabSync } from './hooks/useCrossTabSync';
import { usePerfMock } from './hooks/usePerfMock';
import { useThrottle } from '@/hooks';  // 共享 hook 仍走顶层
```

---

## 四、效果验证

### 4.1 改进对比

| 维度 | 改前 | 改后 |
|------|------|------|
| **语义准确性** | `src/hooks/` 暗示 13 个 hook 都是"共享"的，实际只有 2 个 | `src/hooks/` 仅包含真正共享的 4 个 hook，语义精确 |
| **修改闭环** | 改 ChatInterface 需跳转 `components/` 和 `hooks/` 两处 | ChatInterface 及其专用 hooks 在同一目录树下 |
| **新人导航** | 看到 `hooks/data/` 下 9 个文件，需要逐个了解用途 | 看到 `Chat/hooks/` 立即明白"这些是 Chat 功能专用的" |
| **目录膨胀** | `hooks/data/` 9 个文件，`hooks/` 总计 13 个 | `hooks/` 仅 4 个共享工具，组件目录各自管理专用 hooks |
| **依赖可见性** | 需要看 import 语句才能知道 hook 的消费者 | 文件位置本身就说明了 hook 的归属和作用域 |

### 4.2 风险控制

| 风险 | 缓解措施 |
|------|----------|
| 移动文件后 import 路径断裂 | 使用 `git mv` + 全局搜索替换 + TypeScript 编译检查 |
| 某个 hook 后续需要被多个组件使用 | 届时提升到 `src/hooks/`，就近放置不会锁定位置 |
| 组件目录变得过深 | Chat 下增加一层 `hooks/` 仍在可接受范围，不超过 3 层 |

### 4.3 适用场景判断

本策略适用于中小型项目（组件数 < 100）。对于大型 monorepo 或微前端项目，可能需要更正式的 feature module 划分（如 Nx、Turborepo 的 library 模式）。当前项目规模下，组件级就近放置已经是最合适的粒度。

---

## 五、总结

这次改动的核心思想不是"反对集中式目录"，而是**让代码的物理位置反映它的逻辑归属**：

- **集中式目录适合共享代码**——`useThrottle` 被 4 个组件使用，放在 `src/hooks/` 完全合理
- **就近放置适合专用代码**——`useChatInitialization` 只服务于 `ChatInterface`，放在它旁边更自然
- **判断标准是消费者数量**，不是代码类型。一个 hook 是"数据类"还是"工具类"不决定它该放哪里，谁用它才决定

> "The closer your code is to where it's used, the easier it is to maintain."
> 
> — Kent C. Dodds
