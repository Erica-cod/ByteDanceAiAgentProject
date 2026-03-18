/**
 * 对话相关类型定义
 */

export interface Conversation {
  _id?: string;
  conversationId: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  isActive: boolean;
}

/**
 * API 层的消息类型（与后端交互用）
 * 区别于 store 层的 Message：多了 conversationId、userId、modelType 等服务端字段
 */
export interface APIMessage {
  _id?: string;
  messageId: string;
  clientMessageId?: string;
  conversationId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  sources?: Array<{ title: string; url: string }>;
  modelType?: 'local' | 'volcano';
  timestamp: string;
}
