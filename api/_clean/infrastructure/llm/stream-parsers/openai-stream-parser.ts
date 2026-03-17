/**
 * OpenAI 兼容 SSE 流解析器
 *
 * 适用于火山引擎、vLLM、TGI、LocalAI 等所有 OpenAI 兼容 API。
 * 格式：
 *   data: {"choices":[{"delta":{"content":"..."},"finish_reason":null}]}
 *   data: {"choices":[{"delta":{"tool_calls":[...]},"finish_reason":null}]}
 *   data: {"choices":[{"delta":{},"finish_reason":"stop"}]}
 *   data: [DONE]
 */

import type { StreamParser, ParsedChunk, ToolCallDelta } from '../providers/types.js';

export class OpenAIStreamParser implements StreamParser {
  /** 累积流式 tool_calls（火山引擎分片返回，需要逐步拼接） */
  private accumulatedToolCalls = new Map<number, { name?: string; arguments: string }>();

  parseLine(line: string): ParsedChunk | null {
    if (!line.trim() || line.startsWith(':')) return null;

    // 必须是 SSE data: 行
    if (!line.startsWith('data: ')) return null;

    const payload = line.slice(6).trim();
    if (payload === '[DONE]') {
      return { done: true, finishReason: 'stop' };
    }

    let data: any;
    try {
      data = JSON.parse(payload);
    } catch {
      return null;
    }

    const choice = data.choices?.[0];
    if (!choice) return null;

    const delta = choice.delta;
    if (!delta) return null;

    const result: ParsedChunk = { done: false };

    // 文本增量
    if (delta.content) {
      result.content = delta.content;
    }

    // 流式 tool_calls 增量（需要累积）
    if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
      const deltas: ToolCallDelta[] = [];
      for (const tc of delta.tool_calls) {
        const index = tc.index ?? 0;
        const func = tc.function;

        if (!this.accumulatedToolCalls.has(index)) {
          this.accumulatedToolCalls.set(index, { arguments: '' });
        }
        const acc = this.accumulatedToolCalls.get(index)!;
        if (func?.name) acc.name = func.name;
        if (func?.arguments) acc.arguments += func.arguments;

        deltas.push({
          index,
          name: func?.name,
          arguments: func?.arguments,
        });
      }
      result.toolCalls = deltas;
    }

    // 完成原因
    if (choice.finish_reason === 'tool_calls') {
      result.done = true;
      result.finishReason = 'tool_calls';

      // 将累积的 tool_calls 转为 completeToolCalls
      const complete: Array<{ name: string; arguments: Record<string, any> }> = [];
      for (const [, acc] of this.accumulatedToolCalls) {
        let args: Record<string, any> = {};
        try { args = JSON.parse(acc.arguments); } catch { /* ignore */ }
        complete.push({ name: acc.name || 'unknown', arguments: args });
      }
      result.completeToolCalls = complete;
    } else if (choice.finish_reason === 'stop') {
      result.done = true;
      result.finishReason = 'stop';
    }

    return result;
  }

  reset(): void {
    this.accumulatedToolCalls.clear();
  }
}
