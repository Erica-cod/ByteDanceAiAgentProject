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
  clientMessageId?: string; // 前端生成的临时消息ID（用于本地缓存与服务端持久化对齐）
  conversationId: string;   // Parent conversation ID
  userId: string;           // Owner user ID
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;        // AI thinking process (for assistant only)
  sources?: Array<{title: string; url: string}>;  // 搜索来源链接 (for assistant only)
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

// ==================== 计划管理相关类型 ====================

/**
 * 任务结构
 */
export interface Task {
  title: string;            // 任务标题
  estimated_hours: number;  // 预估工时
  deadline: string;         // 截止日期 (ISO 8601 格式)
  tags: string[];          // 标签数组
  status?: 'pending' | 'in_progress' | 'completed';  // 任务状态
}

/**
 * 计划数据模型
 */
export interface Plan {
  _id?: string;
  planId: string;          // UUID
  userId: string;          // 所属用户ID
  title: string;           // 计划标题
  goal: string;            // 总目标描述
  tasks: Task[];           // 任务数组
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;       // 是否激活
}

/**
 * 创建计划请求
 */
export interface CreatePlanRequest {
  userId: string;
  title: string;
  goal: string;
  tasks: Task[];
}

/**
 * 更新计划请求
 */
export interface UpdatePlanRequest {
  planId: string;
  userId: string;
  title?: string;
  goal?: string;
  tasks?: Task[];
}

/**
 * 计划列表响应
 */
export interface PlanListResponse {
  plans: Plan[];
  total: number;
}

