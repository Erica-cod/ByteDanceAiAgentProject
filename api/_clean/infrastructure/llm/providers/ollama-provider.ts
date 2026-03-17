/**
 * Ollama 原生协议 Provider
 *
 * 调用 Ollama /api/chat 接口，返回 JSON 行格式的流。
 * 特性：
 *   - 自动检测模型是否支持 tools，不支持时降级为无 tools 请求
 *   - keep_alive / num_gpu 等 Ollama 专属参数
 */

import type { LLMProvider, LLMCallOptions, StreamProtocol, ModelConfig } from './types.js';
import type { ChatMessage } from '../../../../types/chat.js';

export class OllamaProvider implements LLMProvider {
  readonly name: string;
  readonly streamProtocol: StreamProtocol = 'ollama';

  private apiUrl: string;
  private modelName: string;
  private _supportsTools: boolean;
  private keepAlive: string;
  private numGpu: number;

  constructor(config: ModelConfig & { id?: string }) {
    this.name = config.id || `ollama:${config.modelName}`;
    this.apiUrl = config.apiUrl || process.env.OLLAMA_API_URL || 'http://localhost:11434';
    this.modelName = config.modelName;
    this._supportsTools = config.supportsTools;
    this.keepAlive = config.keepAlive || '30m';
    this.numGpu = config.numGpu ?? 999;
  }

  async chat(messages: ChatMessage[], options?: LLMCallOptions): Promise<NodeJS.ReadableStream> {
    const fetch = (await import('node-fetch')).default;

    const body: any = {
      model: this.modelName,
      messages,
      stream: true,
      keep_alive: this.keepAlive,
      options: { num_gpu: this.numGpu },
    };

    // Ollama 不支持 tool_choice，只传 tools
    const hasTools = !!(this._supportsTools && options?.tools?.length);
    if (hasTools) {
      body.tools = options!.tools;
      console.log(`🔧 [${this.name}] 传递 ${options!.tools!.length} 个工具定义`);
    }

    let response = await fetch(`${this.apiUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options?.signal as any,
    });

    // 带 tools 时 400 → 模型不支持 Function Calling，降级重试
    if (!response.ok && hasTools) {
      let errBody = '';
      try { errBody = await response.text(); } catch { /* ignore */ }
      console.warn(`⚠️  [${this.name}] 带 tools 请求失败 (${response.status}): ${errBody.substring(0, 200)}`);
      console.warn(`⚠️  [${this.name}] 降级为无 tools 模式`);

      const fallback = { ...body };
      delete fallback.tools;

      response = await fetch(`${this.apiUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fallback),
        signal: options?.signal as any,
      });
    }

    if (!response.ok) {
      let errBody = '';
      try { errBody = await response.text(); } catch { /* ignore */ }
      throw new Error(`Ollama API 错误 (${this.name}): ${response.statusText} - ${errBody.substring(0, 300)}`);
    }

    return response.body as NodeJS.ReadableStream;
  }

  supportsTools(): boolean {
    return this._supportsTools;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const fetch = (await import('node-fetch')).default;
      const res = await fetch(`${this.apiUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  getModelName(): string {
    return this.modelName;
  }
}
