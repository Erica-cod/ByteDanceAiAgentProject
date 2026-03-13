/**
 * 组件统一导出
 * 
 * 重构后的组件架构：
 * - base/: 基础组件（不感知业务，可跨项目复用）
 * - business/: 业务组件（承载业务逻辑和规则）
 * 
 * 使用建议：
 * - 新功能优先使用重构后的组件
 * - 组件导出统一指向新目录，避免旧路径依赖
 */

// ==================== 基础组件 ====================
export * from './base';

// ==================== 业务组件 ====================

// 聊天相关
export { HeaderControls } from './business/Chat/HeaderControls';
export { ChatInputArea } from './business/Chat/ChatInputArea';
export { default as ChatInterfaceRefactored } from './business/Chat/ChatInterfaceRefactored';
export { default as ConversationList } from './business/Chat/ConversationList';
export { default as SettingsPanel } from './business/Chat/SettingsPanel';

// 消息相关
export { ProgressiveMessageRefactored } from './business/Message/ProgressiveMessageRefactored';
export { MessageItemRenderer } from './business/Message/MessageItemRenderer';
export { default as MessageListRefactored } from './business/Message/MessageListRefactored';

// ==================== 兼容导出（指向新组件）====================
export { default as ChatInterface } from './business/Chat/ChatInterfaceRefactored';
export { default as MessageList } from './business/Message/MessageListRefactored';
export { default as StreamingMarkdown } from './business/Message/StreamingMarkdown';
export { default as MultiAgentDisplay } from './business/Message/MultiAgentDisplay';
export { default as TextStatsIndicator } from './business/Chat/TextStatsIndicator';
export { ProgressiveMessageRefactored as ProgressiveMessage } from './business/Message/ProgressiveMessageRefactored';
export { default as PlanCard } from './business/Message/PlanCard';
export { default as PlanListCard } from './business/Message/PlanListCard';

// ==================== 类型导出 ====================

export type { HeaderControlsProps } from './business/Chat/HeaderControls';
export type { ChatInputAreaProps } from './business/Chat/ChatInputArea';
export type { ProgressiveMessageRefactoredProps } from './business/Message/ProgressiveMessageRefactored';
export type { MessageItemRendererProps } from './business/Message/MessageItemRenderer';

