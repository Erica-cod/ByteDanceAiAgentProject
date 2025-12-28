/**
 * Chat API 类型定义
 */

/**
 * 聊天请求数据
 */
export interface ChatRequestData {
  message: string;
  modelType: 'local' | 'volcano';
  conversationId?: string;
  userId: string;
  deviceId?: string; // 设备指纹 ID（用于并发控制）
  mode?: 'single' | 'multi_agent';  // 聊天模式
  clientUserMessageId?: string; // 前端生成的用户消息ID
  clientAssistantMessageId?: string; // 前端生成的 assistant 占位消息ID
  queueToken?: string; // 队列 token
  resumeFromRound?: number; // 断点续传：从指定轮次恢复
}

/**
 * 消息历史接口
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 请求选项类型
 */
export interface RequestOption<Q = any, D = any> {
  query?: Q;
  data?: D;
  params?: Record<string, string>;
  headers?: Record<string, string>;
}

/**
 * 工具执行结果
 */
export interface ToolExecutionResult {
  resultText: string;
  sources?: Array<{ title: string; url: string }>;
}
