/**
 * 组件统一导出
 * 
 * 组件架构：
 * - base/: 基础组件（不感知业务，可跨项目复用）
 * - business/: 业务组件（承载业务逻辑和规则）
 */

// ==================== 基础组件 ====================
export * from './base';

// ==================== 业务组件 ====================

// 聊天相关
export { HeaderControls } from './business/Chat/HeaderControls';
export { ChatInputArea } from './business/Chat/Input/ChatInputArea';
export { default as ChatInterface } from './business/Chat/ChatInterface';
export { default as ConversationList } from './business/Chat/Sidebar/ConversationList';
export { default as SettingsPanel } from './business/Chat/SettingsPanel';
export { default as TextStatsIndicator } from './business/Chat/Input/TextStatsIndicator';

// 消息相关
export { ProgressiveMessage } from './business/Message/Progressive/ProgressiveMessage';
export { MessageItemRenderer } from './business/Message/MessageItemRenderer';
export { default as MessageList } from './business/Message/MessageList';
export { default as StreamingMarkdown } from './business/Message/StreamingMarkdown';
export { default as MultiAgentDisplay } from './business/Message/MultiAgent/MultiAgentDisplay';
export { default as PlanCard } from './business/Message/Plan/PlanCard';
export { default as PlanListCard } from './business/Message/Plan/PlanListCard';

// ==================== 类型导出 ====================

export type { HeaderControlsProps } from './business/Chat/HeaderControls';
export type { ChatInputAreaProps } from './business/Chat/Input/ChatInputArea';
export type { ProgressiveMessageProps } from './business/Message/Progressive/ProgressiveMessage';
export type { MessageItemRendererProps } from './business/Message/MessageItemRenderer';
