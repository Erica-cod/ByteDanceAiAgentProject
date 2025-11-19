// Database Models and Types

export interface User {
  _id?: string;
  userId: string;           // Unique user identifier
  username?: string;        // Optional username
  createdAt: Date;
  lastActiveAt: Date;
  metadata?: {
    userAgent?: string;
    firstIp?: string;
  };
}

export interface Conversation {
  _id?: string;
  conversationId: string;   // UUID
  userId: string;           // Owner user ID
  title: string;            // Conversation title
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  isActive: boolean;
}

export interface Message {
  _id?: string;
  messageId: string;        // UUID
  conversationId: string;   // Parent conversation ID
  userId: string;           // Owner user ID
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;        // AI thinking process (for assistant only)
  modelType?: 'local' | 'volcano';
  timestamp: Date;
  metadata?: {
    tokens?: number;
    duration?: number;
  };
}

// Request/Response types
export interface CreateConversationRequest {
  userId: string;
  title?: string;
}

export interface AddMessageRequest {
  conversationId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  modelType?: 'local' | 'volcano';
}

export interface ConversationListResponse {
  conversations: Conversation[];
  total: number;
}

export interface MessageListResponse {
  messages: Message[];
  total: number;
  conversation: Conversation;
}

