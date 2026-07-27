/**
 * OpenAI 兼容协议 Provider
 *
 * 覆盖所有暴露 /v1/chat/completions 的服务：
 *   - 火山引擎豆包
 *   - vLLM
 *   - TGI (Text Generation Inference)
 *   - LocalAI
 *   - 任何 OpenAI API 兼容服务
 *
 * 返回 SSE 格式的流：data: {"choices":[{"delta":{...}}]}
 */

import type { LLMProvider, LLMCallOptions, StreamProtocol, ModelConfig } from './types.js';
import type { ChatMessage } from '../../../../types/chat.js';

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  readonly streamProtocol: StreamProtocol = 'openai-sse';

  private apiUrl: string;
  private apiKey: string;
  private modelName: string;
  private _supportsTools: boolean;

  constructor(config: ModelConfig & { id?: string }) {
    this.name = config.id || `openai:${config.modelName}`;
    this.apiUrl = config.apiUrl || process.env.ARK_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
    this.apiKey = config.apiKey || process.env.ARK_API_KEY || '';
    this.modelName = config.modelName;
    this._supportsTools = config.supportsTools;
  }

  async chat(messages: ChatMessage[], options?: LLMCallOptions): Promise<NodeJS.ReadableStream> {
    if (!this.apiKey) {
      throw new Error(`[${this.name}] API Key 未配置`);
    }

    const fetch = (await import('node-fetch')).default;

    const body: any = {
      model: this.modelName,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
      stream_options: { include_usage: true },
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4000,
      top_p: options?.topP ?? 0.95,
    };

    if (this._supportsTools && options?.tools?.length) {
      body.tools = options.tools;
      body.tool_choice = options.tool_choice || 'auto';
      console.log(`🔧 [${this.name}] 传递 ${options.tools.length} 个工具定义`);
    }

    console.log(`🔥 [${this.name}] 调用模型 ${this.modelName}，消息 ${messages.length} 条`);

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options?.signal as any,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`[${this.name}] API 错误 (${response.status}): ${errText.substring(0, 300)}`);
    }

    return response.body as NodeJS.ReadableStream;
  }

  supportsTools(): boolean {
    return this._supportsTools;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  getModelName(): string {
    return this.modelName;
  }
}
