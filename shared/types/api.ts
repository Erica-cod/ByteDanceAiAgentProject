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
  mode?: 'single' | 'multi_agent';  // 聊天模式
  longTextMode?: 'off' | 'plan_review' | 'summarize_only' | 'summarize_then_qa';  // 超长文本处理模式
  longTextOptions?: {
    preferChunking?: boolean;      // 是否优先使用 chunking
    maxChunks?: number;            // 最大分段数
    includeCitations?: boolean;    // 是否包含引用片段
  };
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

