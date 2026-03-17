/**
 * LLM Provider 模块化架构 - 统一入口
 *
 * 用法：
 *   import { getRegistry } from '../providers/index.js';
 *   const provider = getRegistry().getByType('local');
 *   const parser = getRegistry().getStreamParser(provider);
 *   const stream = await provider.chat(messages, { tools });
 */

export type {
  LLMProvider,
  LLMCallOptions,
  StreamProtocol,
  ModelConfig,
  ProviderType,
  StreamParser,
  ParsedChunk,
  ToolCallDelta,
} from './types.js';

export { OllamaProvider } from './ollama-provider.js';
export { OpenAICompatibleProvider } from './openai-compatible-provider.js';
export { LLMProviderRegistry, getRegistry, initializeRegistry, resetRegistry } from './registry.js';

export { OllamaStreamParser } from '../stream-parsers/ollama-stream-parser.js';
export { OpenAIStreamParser } from '../stream-parsers/openai-stream-parser.js';

export { MODEL_CATALOG, findModelConfig } from '../model-catalog.js';
