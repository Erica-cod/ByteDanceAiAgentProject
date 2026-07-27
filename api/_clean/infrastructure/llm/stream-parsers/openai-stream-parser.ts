import type {
  ParsedChunk,
  StreamParser,
  ToolCallDelta,
} from '../providers/types.js';

/**
 * OpenAI-compatible SSE parser.
 *
 * With stream_options.include_usage enabled, providers usually send:
 * finish_reason chunk -> usage-only chunk (choices=[]) -> [DONE].
 * We therefore defer done until the usage chunk/[DONE], otherwise the caller
 * would stop before seeing the authoritative token counts.
 */
export class OpenAIStreamParser implements StreamParser {
  private accumulatedToolCalls = new Map<
    number,
    { name?: string; arguments: string }
  >();

  private pendingFinishReason: 'stop' | 'tool_calls' | null = null;

  parseLine(line: string): ParsedChunk | null {
    if (!line.trim() || line.startsWith(':') || !line.startsWith('data: ')) {
      return null;
    }

    const payload = line.slice(6).trim();
    if (payload === '[DONE]') {
      return this.buildDoneChunk();
    }

    let data: any;
    try {
      data = JSON.parse(payload);
    } catch {
      return null;
    }

    const tokenUsage = data.usage
      ? {
          prompt_tokens: Number(data.usage.prompt_tokens) || 0,
          completion_tokens: Number(data.usage.completion_tokens) || 0,
          total_tokens: Number(data.usage.total_tokens) || 0,
        }
      : undefined;

    const choice = data.choices?.[0];
    if (!choice) {
      return tokenUsage
        ? { ...this.buildDoneChunk(), tokenUsage }
        : null;
    }

    const delta = choice.delta;
    if (!delta) return null;

    const result: ParsedChunk = { done: false, tokenUsage };

    if (delta.content) {
      result.content = delta.content;
    }

    if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
      const deltas: ToolCallDelta[] = [];
      for (const toolCall of delta.tool_calls) {
        const index = toolCall.index ?? 0;
        const func = toolCall.function;
        if (!this.accumulatedToolCalls.has(index)) {
          this.accumulatedToolCalls.set(index, { arguments: '' });
        }
        const accumulated = this.accumulatedToolCalls.get(index)!;
        if (func?.name) accumulated.name = func.name;
        if (func?.arguments) accumulated.arguments += func.arguments;
        deltas.push({
          index,
          name: func?.name,
          arguments: func?.arguments,
        });
      }
      result.toolCalls = deltas;
    }

    if (choice.finish_reason === 'tool_calls') {
      this.pendingFinishReason = 'tool_calls';
    } else if (choice.finish_reason === 'stop') {
      this.pendingFinishReason = 'stop';
    }

    return (
      result.content ||
      result.toolCalls?.length ||
      result.tokenUsage
        ? result
        : null
    );
  }

  reset(): void {
    this.accumulatedToolCalls.clear();
    this.pendingFinishReason = null;
  }

  private buildDoneChunk(): ParsedChunk {
    return {
      done: true,
      finishReason: this.pendingFinishReason || 'stop',
      completeToolCalls:
        this.pendingFinishReason === 'tool_calls'
          ? this.getCompleteToolCalls()
          : undefined,
    };
  }

  private getCompleteToolCalls(): Array<{
    name: string;
    arguments: Record<string, any>;
  }> {
    const complete: Array<{
      name: string;
      arguments: Record<string, any>;
    }> = [];
    for (const [, accumulated] of this.accumulatedToolCalls) {
      let args: Record<string, any> = {};
      try {
        args = JSON.parse(accumulated.arguments);
      } catch {
        // Keep an empty object for malformed partial arguments.
      }
      complete.push({
        name: accumulated.name || 'unknown',
        arguments: args,
      });
    }
    return complete;
  }
}
