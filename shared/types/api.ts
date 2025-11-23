/**
 * 共享的 API 类型定义
 * 供前端和后端共同使用
 */

export interface User {
  userId: string;
  preferences?: Record<string, any>;
  createdAt: Date;
  updatedAt?: Date;
}

export interface Conversation {
  conversationId: string;
  userId: string;
  title: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  messageId: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  sources?: Array<{title: string; url: string}>;  // 搜索来源链接
  timestamp: Date;
}

export interface ChatRequest {
  message: string;
  modelType: 'local' | 'volcano';
  conversationId?: string;
  userId: string;
}

export interface ConversationsListResponse {
  conversations: Conversation[];
  total: number;
}

export interface ConversationDetailResponse {
  conversation: Conversation;
  messages: Message[];
  total: number;
}

