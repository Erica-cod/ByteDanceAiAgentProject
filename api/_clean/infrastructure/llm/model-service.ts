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
  maxTokens?: number;
}

/**
 * 根据用户消息内容动态估算合理的 maxTokens 上限。
 * 短问候/简单问答给较少 token，复杂分析给较多。
 */
export function estimateMaxTokens(messages: ChatMessage[]): number {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) return 2000;

  const text = lastUserMsg.content || '';
  const len = text.length;

  // 短问候 / 简单指令（<60字）
  if (len < 60) {
    const greetingPattern = /^(你好|hi|hello|hey|嗨|早上好|晚上好|谢谢|ok|好的|嗯|再见)/i;
    if (greetingPattern.test(text.trim())) return 500;
    return 1000;
  }

  // 中等长度（60-300字）
  if (len < 300) return 2000;

  // 较长请求（300-1000字）
  if (len < 1000) return 3000;

  // 长文本分析（>1000字）
  return 4000;
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
  const maxTokens = options.maxTokens ?? estimateMaxTokens(messages);
  console.log(`📊 [ModelService] 动态 maxTokens: ${maxTokens}`);

  const provider = getRegistry().getByType('remote');
  return provider.chat(messages, {
    signal: options.signal,
    tools: options.tools,
    tool_choice: options.tool_choice,
    temperature: 0.7,
    maxTokens,
    topP: 0.95,
  });
}

/**
 * 调用远程 lite 模型（成本更低，适合简单任务）。
 * 若 lite provider 未注册则 fallback 到标准远程模型。
 */
export async function callRemoteLiteModel(
  messages: ChatMessage[],
  options: ModelCallOptions = {}
) {
  const registry = getRegistry();
  const liteProvider = registry.get('remote-lite');

  if (!liteProvider || !(await liteProvider.isAvailable())) {
    console.log('📊 [ModelService] remote-lite 不可用，fallback 到标准远程模型');
    return callVolcengineModel(messages, options);
  }

  const maxTokens = options.maxTokens ?? estimateMaxTokens(messages);
  console.log(`📊 [ModelService] 使用 lite 模型, maxTokens: ${maxTokens}`);

  return liteProvider.chat(messages, {
    signal: options.signal,
    tools: options.tools,
    tool_choice: options.tool_choice,
    temperature: 0.7,
    maxTokens,
    topP: 0.95,
  });
}
