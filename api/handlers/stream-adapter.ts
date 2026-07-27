/**
 * Provider-neutral stream adapter used by the single-agent SSE handler.
 */
export interface ParsedChunk {
  content?: string;
  thinking?: string;
  done?: boolean;
  finishReason?: string;
  completeToolCalls?: Array<{ name: string; arguments: any }>;
  tokenUsage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface StreamAdapter {
  parseLine(line: string): ParsedChunk | null;
  getAccumulatedContent(): string;
  getAccumulatedThinking(): string;
  getRawAccumulatedContent(): string;
  reset(): void;
}

/**
 * OpenAI-compatible SSE adapter.
 *
 * A finish_reason chunk is not treated as final immediately because the next
 * chunk may be choices=[] plus usage. This keeps usage accounting reliable.
 */
export class OpenAIStreamAdapter implements StreamAdapter {
  private accumulatedText = '';
  private accumulatedToolCalls = new Map<
    number,
    { name?: string; arguments: string }
  >();
  private lastTokenUsage: ParsedChunk['tokenUsage'];
  private pendingFinishReason: string | undefined;

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

    if (data.usage) {
      this.lastTokenUsage = {
        prompt_tokens: Number(data.usage.prompt_tokens) || 0,
        completion_tokens: Number(data.usage.completion_tokens) || 0,
        total_tokens: Number(data.usage.total_tokens) || 0,
      };
    }

    const choice = data.choices?.[0];
    if (!choice?.delta) {
      return data.usage ? this.buildDoneChunk() : null;
    }

    const delta = choice.delta;
    if (Array.isArray(delta.tool_calls)) {
      for (const toolCall of delta.tool_calls) {
        const index = toolCall.index ?? 0;
        if (!this.accumulatedToolCalls.has(index)) {
          this.accumulatedToolCalls.set(index, { arguments: '' });
        }
        const accumulated = this.accumulatedToolCalls.get(index)!;
        if (toolCall.function?.name) {
          accumulated.name = toolCall.function.name;
        }
        if (toolCall.function?.arguments) {
          accumulated.arguments += toolCall.function.arguments;
        }
      }
    }

    const content = delta.content || '';
    if (content) this.accumulatedText += content;

    if (choice.finish_reason === 'tool_calls') {
      this.pendingFinishReason = 'tool_calls';
    } else if (choice.finish_reason === 'stop') {
      this.pendingFinishReason = 'stop';
    }

    return content ? { content } : null;
  }

  getAccumulatedContent(): string {
    return this.accumulatedText;
  }

  getAccumulatedThinking(): string {
    return '';
  }

  getRawAccumulatedContent(): string {
    return this.accumulatedText;
  }

  reset(): void {
    this.accumulatedText = '';
    this.accumulatedToolCalls.clear();
    this.lastTokenUsage = undefined;
    this.pendingFinishReason = undefined;
  }

  private buildDoneChunk(): ParsedChunk {
    return {
      done: true,
      finishReason: this.pendingFinishReason || 'stop',
      completeToolCalls:
        this.pendingFinishReason === 'tool_calls'
          ? this.getCompleteToolCalls()
          : undefined,
      tokenUsage: this.lastTokenUsage,
    };
  }

  private getCompleteToolCalls(): NonNullable<
    ParsedChunk['completeToolCalls']
  > {
    const calls: NonNullable<ParsedChunk['completeToolCalls']> = [];
    for (const [, accumulated] of this.accumulatedToolCalls) {
      if (!accumulated.name) continue;
      let args: any = {};
      try {
        args = JSON.parse(accumulated.arguments);
      } catch {
        // Keep an empty object for malformed partial arguments.
      }
      calls.push({ name: accumulated.name, arguments: args });
    }
    return calls;
  }
}
