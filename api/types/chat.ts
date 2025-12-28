/**
 * Chat API 类型定义
 */

// 请求选项类型
export interface RequestOption<Q = any, D = any> {
  query?: Q;
  data?: D;
  params?: Record<string, string>;
  headers?: Record<string, string>;
}

// 聊天请求数据
export interface ChatRequestData {
  message: string;
  modelType: 'local' | 'volcano';
  conversationId?: string;
  userId: string;
  deviceId?: string; // 设备指纹 ID（用于并发控制，优先于 userId）
  mode?: 'single' | 'multi_agent';  // 聊天模式：单agent或多agent
  /** 前端生成的消息ID：用于和本地缓存对齐（精确去重） */
  clientUserMessageId?: string;
  /** 前端生成的 assistant 占位消息ID：用于和本地缓存对齐（精确去重） */
  clientAssistantMessageId?: string;
  /** 队列 token（客户端重试时携带，用于保持队列位置） */
  queueToken?: string;
  /** 断点续传：从指定轮次恢复（用于多 agent 模式） */
  resumeFromRound?: number;
}

// 消息历史接口
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 统一返回 429（用于限流/并发限制）+ 队列信息
 */
export function tooManyRequests(
  message: string,
  retryAfterSec: number,
  queueToken?: string,
  queuePosition?: number,
  estimatedWaitSec?: number
): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Retry-After': String(retryAfterSec),
  };

  // 添加队列相关 header（如果有）
  if (queueToken) {
    headers['X-Queue-Token'] = queueToken;
  }
  if (queuePosition !== undefined) {
    headers['X-Queue-Position'] = String(queuePosition);
  }
  if (estimatedWaitSec !== undefined) {
    headers['X-Queue-Estimated-Wait'] = String(estimatedWaitSec);
  }

  return new Response(JSON.stringify({ success: false, error: message }), {
    status: 429,
    headers,
  });
}

