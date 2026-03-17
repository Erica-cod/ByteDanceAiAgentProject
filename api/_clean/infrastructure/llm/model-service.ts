/**
 * 模型调用服务（统一入口）
 *
 * 内部委托给 LLMProviderRegistry 模块化架构。
 * 推荐直接使用 getRegistry().getByType('local' | 'remote').chat()。
 */

import type { ChatMessage } from '../../../types/chat.js';
import type { FunctionSchema } from '../../../tools/core/types.js';
import { getRegistry } from './providers/registry.js';

export interface ModelCallOptions {
  signal?: AbortSignal;
  tools?: Array<{ type: 'function'; function: FunctionSchema }>;
  tool_choice?: 'auto' | 'none' | 'required';
}

export async function callLocalModel(
  messages: ChatMessage[],
  options: ModelCallOptions = {}
) {
  const provider = getRegistry().getByType('local');
  return provider.chat(messages, {
    signal: options.signal,
    tools: options.tools,
    tool_choice: options.tool_choice,
  });
}

export async function callVolcengineModel(
  messages: ChatMessage[],
  options: ModelCallOptions = {}
) {
  const provider = getRegistry().getByType('remote');
  return provider.chat(messages, {
    signal: options.signal,
    tools: options.tools,
    tool_choice: options.tool_choice,
    temperature: 0.7,
    maxTokens: 4000,
    topP: 0.95,
  });
}
