/**
 * 组件统一导出
 * 
 * 重构后的组件架构：
 * - base/: 基础组件（不感知业务，可跨项目复用）
 * - business/: 业务组件（承载业务逻辑和规则）
 * 
 * 使用建议：
 * - 新功能优先使用重构后的组件
 * - 旧组件保留向后兼容，逐步迁移
 */

// ==================== 基础组件 ====================
export * from './base';

// ==================== 业务组件 ====================

// 聊天相关
export { HeaderControls } from './business/Chat/HeaderControls';
export { ChatInputArea } from './business/Chat/ChatInputArea';
export { default as ChatInterfaceRefactored } from './business/Chat/ChatInterfaceRefactored';

// 消息相关
export { ProgressiveMessageRefactored } from './business/Message/ProgressiveMessageRefactored';
export { MessageItemRenderer } from './business/Message/MessageItemRenderer';
export { default as MessageListRefactored } from './business/Message/MessageListRefactored';

// ==================== 旧组件（向后兼容）====================

// 保留旧组件导出，逐步迁移
export { default as ChatInterface } from './old-structure/ChatInterface';
export { default as MessageList } from './old-structure/MessageList';
export { default as ConversationList } from './old-structure/ConversationList';
export { default as SettingsPanel } from './old-structure/SettingsPanel';
export { default as StreamingMarkdown } from './old-structure/StreamingMarkdown';
export { default as MultiAgentDisplay } from './old-structure/MultiAgentDisplay';
export { default as TextStatsIndicator } from './old-structure/TextStatsIndicator';
export { ProgressiveMessage } from './old-structure/ProgressiveMessage';
export { default as PlanCard } from './old-structure/PlanCard';
export { default as PlanListCard } from './old-structure/PlanListCard';

// ==================== 类型导出 ====================

export type { HeaderControlsProps } from './business/Chat/HeaderControls';
export type { ChatInputAreaProps } from './business/Chat/ChatInputArea';
export type { ProgressiveMessageRefactoredProps } from './business/Message/ProgressiveMessageRefactored';
export type { MessageItemRendererProps } from './business/Message/MessageItemRenderer';

