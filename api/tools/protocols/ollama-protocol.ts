/**
 * Ollama 协议（可插拔）
 *
 * 兼容场景：
 * 1) Ollama 的 OpenAI-compatible 工具调用：tool_calls 数组
 *    - { tool_calls: [{ function: { name, arguments } }] }
 *    - 其中 arguments 可能是 object 或 string(JSON)
 *
 * 2) 本地模型输出文本中包含 <tool_call>{...}</tool_call> 的 JSON（由上层 extractor 提取后传入）
 *    - { tool: "search_web", query: "...", options: {...} }
 *    - 或 { name: "search_web", args: {...} }
 */

import type { ToolCallProtocol, NormalizedToolCall, TextToolExecutionResult } from './types.js';
import type { ToolContext, ToolResult } from '../core/types.js';

function safeJsonParse(input: any): any {
  if (input == null) return {};
  if (typeof input === 'object') return input;
  if (typeof input !== 'string') return {};
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
}

function normalizeFromFunctionLike(fnLike: any): NormalizedToolCall {
  const toolName = fnLike?.name || 'unknown';
  const args = safeJsonParse(fnLike?.arguments);
  return { toolName, params: args };
}

export const ollamaProtocol: ToolCallProtocol = {
  name: 'ollama',

  canHandle(toolCall: any): boolean {
    // OpenAI-compatible: tool_calls
    if (Array.isArray(toolCall?.tool_calls) && toolCall.tool_calls.length > 0) return true;
    // 有些实现会包在 message 里
    if (Array.isArray(toolCall?.message?.tool_calls) && toolCall.message.tool_calls.length > 0) return true;

    // <tool_call> JSON 常见两种
    if (toolCall?.name && toolCall?.args) return true;

    return false;
  },

  parse(toolCall: any): NormalizedToolCall {
    // 1) tool_calls 在 message 里
    const toolCallsArr = Array.isArray(toolCall?.tool_calls)
      ? toolCall.tool_calls
      : (Array.isArray(toolCall?.message?.tool_calls) ? toolCall.message.tool_calls : null);

    if (toolCallsArr && toolCallsArr.length > 0) {
      const first = toolCallsArr[0];
      const fn = first?.function || first;
      const normalized = normalizeFromFunctionLike(fn);
      return {
        ...normalized,
        meta: toolCallsArr.length > 1 ? { totalToolCalls: toolCallsArr.length } : undefined,
      };
    }

    // 2) <tool_call>{"name":"xxx","args":{...}}</tool_call>
    if (toolCall?.name && toolCall?.args) {
      return {
        toolName: String(toolCall.name),
        params: toolCall.args || {},
      };
    }

    // 兜底
    return { toolName: 'unknown', params: toolCall };
  },

  formatToTextResult(result: ToolResult, _context: ToolContext): TextToolExecutionResult {
    // Ollama 在你当前系统里走 SSE/文本通道，保持与 legacy 一致的输出即可
    if (result.success) {
      const payload = result.data ?? result.message ?? '执行成功';
      return {
        resultText: `<tool_result>\n${typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)}\n</tool_result>`,
        sources: result.sources || [],
      };
    }

    return {
      resultText: `<tool_error>${result.error || '工具执行失败'}</tool_error>`,
      sources: [],
    };
  },
};


