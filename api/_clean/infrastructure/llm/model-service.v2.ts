/**
 * 模型调用服务 V2（已迁移到 providers/ 模块化架构）
 *
 * @deprecated 请使用 getRegistry().getByType('local' | 'remote').chat()
 * 此文件保留仅为兼容旧调用方，内部委托给新 Provider
 */

import type { ChatMessage } from '../../../types/chat.js';
import type { FunctionSchema } from '../../../tools/v2/core/types.js';
import { getRegistry } from './providers/registry.js';

export interface ModelCallOptions {
  signal?: AbortSignal;
  tools?: Array<{ type: 'function'; function: FunctionSchema }>;
  tool_choice?: 'auto' | 'none' | 'required';
}

/** @deprecated 使用 getRegistry().getByType('local').chat() */
export async function callLocalModelV2(
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

/** @deprecated 使用 getRegistry().getByType('remote').chat() */
export async function callVolcengineModelV2(
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

