/**
 * 工具系统 - 通信协议（可插拔）类型定义
 *
 * 这里的“通信协议”指：
 * - 如何从“模型/上游”传入的 toolCall 对象中解析出 toolName + params
 * - 如何把 ToolResult 格式化成上游需要的输出（例如旧系统的 <tool_result> 文本）
 *
 * 注意：这里不涉及工具内部的 HTTP/RPC 调用；那属于具体 ToolPlugin 的实现细节。
 */

import type { ToolContext, ToolResult } from '../core/types.js';

/**
 * 协议解析后的标准化结构
 */
export interface NormalizedToolCall {
  toolName: string;
  params: any;
  /**
   * 可选：协议层携带的“显示用提示”（例如 legacy 格式里的 query/options）
   * core 执行器不关心，但适配层可能会用到。
   */
  meta?: Record<string, any>;
}

/**
 * 给旧系统/纯文本通道的工具返回格式（你现在 SSE handler 里就是这种）
 */
export interface TextToolExecutionResult {
  resultText: string;
  sources?: Array<{ title: string; url: string }>;
}

/**
 * 工具调用通信协议接口（可插拔）
 */
export interface ToolCallProtocol {
  /** 协议名称（唯一） */
  name: string;

  /** 是否能处理该 toolCall 输入 */
  canHandle(toolCall: any): boolean;

  /** 解析 toolCall -> 标准化结构 */
  parse(toolCall: any): NormalizedToolCall;

  /**
   * 将 ToolResult 转成旧系统/纯文本通道要的格式（可选）
   * - legacy-adapter 会优先使用这个
   * - 如果协议未实现，则由适配层做统一兜底格式化
   */
  formatToTextResult?(result: ToolResult, context: ToolContext): TextToolExecutionResult;
}


