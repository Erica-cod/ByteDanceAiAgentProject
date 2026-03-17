/**
 * Ollama JSON 行流解析器
 *
 * Ollama /api/chat 返回格式：
 *   文本: {"message":{"role":"assistant","content":"..."},"done":false}
 *   完成: {"message":{"role":"assistant","content":""},"done":true}
 *   工具: {"message":{"role":"assistant","tool_calls":[...]},"done":true}
 */

import type { StreamParser, ParsedChunk } from '../providers/types.js';

export class OllamaStreamParser implements StreamParser {
  parseLine(line: string): ParsedChunk | null {
    if (!line.trim()) return null;

    let data: any;
    try {
      data = JSON.parse(line);
    } catch {
      return null;
    }

    const result: ParsedChunk = { done: false };

    if (data.message?.content) {
      result.content = data.message.content;
    }

    if (data.done) {
      result.done = true;

      // Ollama 在 done=true 时一次性返回完整的 tool_calls
      const toolCalls = data.message?.tool_calls;
      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        result.finishReason = 'tool_calls';
        result.completeToolCalls = toolCalls.map((tc: any) => {
          const args = typeof tc.function?.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : tc.function?.arguments || {};
          return { name: tc.function?.name || 'unknown', arguments: args };
        });
      } else {
        result.finishReason = 'stop';
      }
    }

    return result;
  }

  reset(): void {
    // Ollama 解析器无状态，无需重置
  }
}
