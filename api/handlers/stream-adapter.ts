/**
 * StreamAdapter — 统一流解析接口
 *
 * 不同 LLM 提供商返回的流格式不同：
 * - OpenAI / 火山引擎：SSE `data: {...}` 行
 * - Ollama：逐行 JSON
 *
 * 此接口将差异封装起来，让上层的工具调用、消息保存、SSE 推送逻辑只写一份。
 */

export interface ParsedChunk {
  content?: string;
  thinking?: string;
  done?: boolean;
  finishReason?: string;
  /** 流式模式下完整累积的工具调用列表（done=true 时可用） */
  completeToolCalls?: Array<{ name: string; arguments: any }>;
  /** token 用量（仅 OpenAI 兼容格式有） */
  tokenUsage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface StreamAdapter {
  parseLine(line: string): ParsedChunk | null;
  getAccumulatedContent(): string;
  getAccumulatedThinking(): string;
  getRawAccumulatedContent(): string;
  reset(): void;
}

/**
 * OpenAI / 火山引擎 SSE 格式适配器
 *
 * 解析 `data: {...}` 行，累积 delta.content 和流式 tool_calls
 */
export class OpenAIStreamAdapter implements StreamAdapter {
  private accumulatedText = '';
  private accumulatedToolCalls: Map<number, { name?: string; arguments: string }> = new Map();
  private lastTokenUsage: ParsedChunk['tokenUsage'] = undefined;

  parseLine(line: string): ParsedChunk | null {
    if (!line.trim() || line.startsWith(':')) return null;
    if (!line.startsWith('data: ')) return null;

    const data = line.slice(6);
    if (data === '[DONE]') return null;

    let jsonData: any;
    try {
      jsonData = JSON.parse(data);
    } catch {
      return null;
    }

    if (jsonData.usage) {
      this.lastTokenUsage = {
        prompt_tokens: jsonData.usage.prompt_tokens || 0,
        completion_tokens: jsonData.usage.completion_tokens || 0,
        total_tokens: jsonData.usage.total_tokens || 0,
      };
    }

    const choice = jsonData.choices?.[0];
    if (!choice?.delta) return null;

    const delta = choice.delta;

    // 累积 tool_calls
    if (delta.tool_calls?.length) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index || 0;
        if (!this.accumulatedToolCalls.has(idx)) {
          this.accumulatedToolCalls.set(idx, { arguments: '' });
        }
        const acc = this.accumulatedToolCalls.get(idx)!;
        if (tc.function?.name) acc.name = tc.function.name;
        if (tc.function?.arguments) acc.arguments += tc.function.arguments;
      }
      return null; // 继续累积
    }

    // 工具调用完成
    if (choice.finish_reason === 'tool_calls') {
      const calls: ParsedChunk['completeToolCalls'] = [];
      for (const [, acc] of this.accumulatedToolCalls) {
        if (!acc.name) continue;
        let args: any;
        try { args = JSON.parse(acc.arguments); } catch { args = {}; }
        calls.push({ name: acc.name, arguments: args });
      }
      this.accumulatedToolCalls.clear();
      return { done: true, finishReason: 'tool_calls', completeToolCalls: calls };
    }

    // 普通内容
    const content = delta.content || '';
    if (content) {
      this.accumulatedText += content;
    }

    if (choice.finish_reason === 'stop') {
      return {
        content: content || undefined,
        done: true,
        finishReason: 'stop',
        tokenUsage: this.lastTokenUsage,
      };
    }

    return content ? { content } : null;
  }

  getAccumulatedContent(): string { return this.accumulatedText; }
  getAccumulatedThinking(): string { return ''; }
  getRawAccumulatedContent(): string { return this.accumulatedText; }

  reset(): void {
    this.accumulatedText = '';
    this.accumulatedToolCalls.clear();
    this.lastTokenUsage = undefined;
  }
}
