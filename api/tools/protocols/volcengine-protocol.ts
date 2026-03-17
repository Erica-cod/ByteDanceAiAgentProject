/**
 * 火山（Volcengine）协议：兼容 OpenAI function 格式与旧格式 {tool, query, options}
 *
 * 说明：火山引擎在流式阶段会分片返回 tool_calls，但在进入“执行工具”环节时，
 * 一般都会被上层聚合成一个完整对象（例如 { function: { name, arguments } }）。
 * 该协议专注于“执行前”的解析与“执行后”的文本格式化。
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

export const volcengineProtocol: ToolCallProtocol = {
  name: 'volcengine',

  canHandle(toolCall: any): boolean {
    // 旧格式：{ tool, query, options }
    if (toolCall?.tool && typeof toolCall.tool === 'string') return true;
    // OpenAI function 格式：{ function: { name, arguments } }
    if (toolCall?.function?.name && typeof toolCall.function.name === 'string') return true;
    return false;
  },

  parse(toolCall: any): NormalizedToolCall {
    // 旧格式
    if (toolCall?.tool && typeof toolCall.tool === 'string') {
      const toolName = toolCall.tool;
      const query = toolCall.query;
      const options = toolCall.options;

      const params = {
        ...(query ? { query } : {}),
        ...(options || {}),
      };

      return {
        toolName,
        params,
        meta: { query, options },
      };
    }

    // OpenAI function 格式
    if (toolCall?.function?.name) {
      const toolName = toolCall.function.name;
      const args = safeJsonParse(toolCall.function.arguments);
      return { toolName, params: args };
    }

    return { toolName: 'unknown', params: toolCall };
  },

  formatToTextResult(result: ToolResult, _context: ToolContext): TextToolExecutionResult {
    // 这里复用你现有 legacy 文本协议，保证 SSE/旧系统兼容
    if (result.success) {
      let resultText = '';

      if (result.data) {
        // 搜索工具返回格式（保持现有行为）
        if (result.data.results && result.data.answer) {
          resultText = `<search_results>\nAI 摘要：\n${result.data.answer}\n\n${result.data.results}\n</search_results>`;
        }
        // 计划工具返回格式
        else if (result.message) {
          resultText = `<tool_result>\n${result.message}\n\n详细数据:\n${JSON.stringify(result.data, null, 2)}\n</tool_result>`;
        }
        // 通用格式
        else {
          resultText = `<tool_result>\n${JSON.stringify(result.data, null, 2)}\n</tool_result>`;
        }
      } else {
        resultText = `<tool_result>\n${result.message || '执行成功'}\n</tool_result>`;
      }

      return {
        resultText,
        sources: result.sources || [],
      };
    }

    return {
      resultText: `<tool_error>${result.error || '工具执行失败'}</tool_error>`,
      sources: [],
    };
  },
};


