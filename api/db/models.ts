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
  lastAccessedAt?: Date;    // ✅ LRU: 最后访问时间
  messageCount: number;
  isActive: boolean;
  isArchived?: boolean;     // ✅ LRU: 是否已归档
  archivedAt?: Date;        // ✅ LRU: 归档时间
}

export interface Message {
  _id?: string;
  messageId: string;        // UUID
  clientMessageId?: string; // 前端生成的临时消息ID（用于本地缓存与服务端持久化对齐）
  conversationId: string;   // Parent conversation ID
  userId: string;           // Owner user ID
  role: 'user' | 'assistant';
  content: string;
  contentPreview?: string;  // ✅ 新增：内容预览（前1000字符，用于快速加载）
  contentLength?: number;   // ✅ 新增：完整内容长度
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

// ==================== 文件上传会话管理 ====================

/**
 * 上传会话（用于分片上传）
 * 
 * 设计说明：
 * - 保存在内存或文件系统，也可以用MongoDB
 * - 支持断点续传
 * - TTL：1小时后自动清理
 */
export interface UploadSession {
  _id?: string;
  sessionId: string;              // 上传会话ID
  userId: string;                 // 用户ID
  totalChunks: number;            // 总分片数
  chunkSize: number;              // 分片大小
  fileSize: number;               // 文件总大小
  uploadedChunks: number[];       // 已上传的分片索引
  chunkHashes: Map<number, string>; // 分片hash映射（用于校验）
  isComplete: boolean;            // 是否完成
  isCompressed: boolean;          // 是否压缩
  createdAt: Date;                // 创建时间
  updatedAt: Date;                // 最后更新时间
  expiresAt: Date;                // 过期时间
}

/**
 * 创建上传会话请求
 */
export interface CreateUploadSessionRequest {
  userId: string;
  totalChunks: number;
  chunkSize: number;
  fileSize: number;
}

/**
 * 上传分片请求
 */
export interface UploadChunkRequest {
  sessionId: string;
  chunkIndex: number;
  chunk: Buffer;
  hash: string;
}

// ==================== 多 Agent 会话状态管理 ====================

/**
 * 多 Agent 会话状态（用于断点续传）
 * 
 * 设计说明：
 * - 保存在 MongoDB，不使用 Redis
 * - 原因：低频操作（每轮才保存一次）、需要持久化、数据规模小且可预测
 * - TTL：5分钟后自动过期（MongoDB TTL索引）
 * 
 * 详见：docs/ARCHITECTURE_DECISION.md
 */
export interface MultiAgentSession {
  _id?: string;
  sessionId: string;              // conversationId:assistantMessageId 组合键
  conversationId: string;         // 对话ID
  userId: string;                 // 用户ID
  assistantMessageId: string;     // 助手消息ID（客户端生成）
  completedRounds: number;        // 已完成的轮次
  sessionState: any;              // 完整的会话状态（orchestrator.getSession()）
  userQuery: string;              // 用户查询
  createdAt: Date;                // 创建时间
  updatedAt: Date;                // 最后更新时间
  expiresAt: Date;                // 过期时间（用于 MongoDB TTL 索引自动清理）
}

/**
 * 保存多 Agent 状态请求
 */
export interface SaveMultiAgentStateRequest {
  conversationId: string;
  userId: string;
  assistantMessageId: string;
  completedRounds: number;
  sessionState: any;
  userQuery: string;
}

/**
 * 多 Agent 状态响应
 */
export interface MultiAgentStateResponse {
  found: boolean;
  completedRounds?: number;
  sessionState?: any;
  userQuery?: string;
  updatedAt?: Date;
}

