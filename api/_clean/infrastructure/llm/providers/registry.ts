/**
 * LLM Provider 注册表
 *
 * 负责根据环境变量和模型目录，自动创建并注册 Provider 实例。
 * 调用方通过 getByType('local' | 'remote') 获取对应的 Provider。
 */

import type { LLMProvider, StreamParser } from './types.js';
import { OllamaProvider } from './ollama-provider.js';
import { OpenAICompatibleProvider } from './openai-compatible-provider.js';
import { OllamaStreamParser } from '../stream-parsers/ollama-stream-parser.js';
import { OpenAIStreamParser } from '../stream-parsers/openai-stream-parser.js';
import { findModelConfig } from '../model-catalog.js';

export class LLMProviderRegistry {
  private providers = new Map<string, LLMProvider>();
  private typeMapping = new Map<string, string>(); // 'local' -> providerId, 'remote' -> providerId

  /** 注册一个 Provider */
  register(id: string, provider: LLMProvider, type?: 'local' | 'remote'): void {
    this.providers.set(id, provider);
    if (type) {
      this.typeMapping.set(type, id);
    }
    console.log(`✅ [Registry] 已注册 LLM Provider: ${id} (${provider.getModelName()})${type ? ` [${type}]` : ''}`);
  }

  /** 按 ID 获取 Provider */
  get(id: string): LLMProvider | undefined {
    return this.providers.get(id);
  }

  /** 按类型获取 Provider（local / remote） */
  getByType(type: 'local' | 'remote'): LLMProvider {
    const id = this.typeMapping.get(type);
    if (!id) {
      throw new Error(`[Registry] 没有注册 type=${type} 的 Provider`);
    }
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`[Registry] Provider "${id}" 已失效`);
    }
    return provider;
  }

  /** 列出所有已注册的 Provider */
  list(): Array<{ id: string; name: string; model: string; protocol: string }> {
    const result: Array<{ id: string; name: string; model: string; protocol: string }> = [];
    for (const [id, p] of this.providers) {
      result.push({ id, name: p.name, model: p.getModelName(), protocol: p.streamProtocol });
    }
    return result;
  }

  /** 根据 Provider 的 streamProtocol 获取对应的 StreamParser（自动传入模型格式配置） */
  getStreamParser(provider: LLMProvider): StreamParser {
    switch (provider.streamProtocol) {
      case 'ollama': {
        const ollamaProvider = provider as OllamaProvider;
        return new OllamaStreamParser({
          thinkingMode: ollamaProvider.getThinkingMode(),
          thinkingField: ollamaProvider.getThinkingField(),
          thinkingTag: ollamaProvider.getThinkingTag(),
          toolCallsInStream: ollamaProvider.getToolCallsInStream(),
        });
      }
      case 'openai-sse':
        return new OpenAIStreamParser();
      default:
        throw new Error(`[Registry] 未知的流协议: ${provider.streamProtocol}`);
    }
  }
}

// ─────────────── 单例 + 自动初始化 ───────────────

let _registry: LLMProviderRegistry | null = null;

/**
 * 基于环境变量自动创建并注册 Provider
 */
export function initializeRegistry(): LLMProviderRegistry {
  const registry = new LLMProviderRegistry();

  // ── 本地模型（Ollama）──
  const ollamaModel = process.env.OLLAMA_MODEL || 'qwen3:8b';
  const catalogConfig = findModelConfig(ollamaModel);

  if (catalogConfig && catalogConfig.provider === 'ollama') {
    const provider = new OllamaProvider({
      ...catalogConfig,
      modelName: ollamaModel,
      apiUrl: process.env.OLLAMA_API_URL,
      id: 'local',
    });
    registry.register('local', provider, 'local');
  } else {
    // 目录中没有，但仍然创建一个默认 Ollama Provider（允许用户使用任意 Ollama 模型）
    const provider = new OllamaProvider({
      provider: 'ollama',
      modelName: ollamaModel,
      supportsTools: catalogConfig?.supportsTools ?? false,
      description: `自定义 Ollama 模型: ${ollamaModel}`,
      apiUrl: process.env.OLLAMA_API_URL,
      id: 'local',
    });
    registry.register('local', provider, 'local');
    console.warn(`⚠️  [Registry] 模型 "${ollamaModel}" 不在模型目录中，以默认配置注册`);
  }

  // ── 远程模型（火山引擎 / OpenAI 兼容）──
  const arkApiKey = process.env.ARK_API_KEY;
  const arkModel = process.env.ARK_MODEL || 'doubao-1-5-thinking-pro-250415';

  if (arkApiKey) {
    const remoteCatalog = findModelConfig(arkModel);
    const provider = new OpenAICompatibleProvider({
      provider: 'openai-compatible',
      modelName: arkModel,
      supportsTools: remoteCatalog?.supportsTools ?? true,
      description: remoteCatalog?.description || `远程模型: ${arkModel}`,
      apiUrl: process.env.ARK_API_URL,
      apiKey: arkApiKey,
      id: 'remote',
    });
    registry.register('remote', provider, 'remote');

    // 注册 lite 远程模型（用于简单请求的低成本路由）
    const liteModel = process.env.ARK_LITE_MODEL || 'doubao-seed-1-6-lite-251015';
    const liteCatalog = findModelConfig(liteModel);
    const liteProvider = new OpenAICompatibleProvider({
      provider: 'openai-compatible',
      modelName: liteModel,
      supportsTools: liteCatalog?.supportsTools ?? true,
      description: liteCatalog?.description || `远程轻量模型: ${liteModel}`,
      apiUrl: process.env.ARK_API_URL,
      apiKey: arkApiKey,
      id: 'remote-lite',
    });
    registry.register('remote-lite', liteProvider);
  } else {
    console.warn('⚠️  [Registry] ARK_API_KEY 未配置，远程 Provider 不可用');
  }

  console.log(`📦 [Registry] 初始化完成，已注册 ${registry.list().length} 个 Provider`);
  return registry;
}

export function getRegistry(): LLMProviderRegistry {
  if (!_registry) {
    _registry = initializeRegistry();
  }
  return _registry;
}

/**
 * 重新初始化（用于环境变量变更后）
 */
export function resetRegistry(): void {
  _registry = null;
}
