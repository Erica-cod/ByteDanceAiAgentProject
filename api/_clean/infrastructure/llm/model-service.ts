/**
 * 模型调用服务（已迁移到 providers/ 模块化架构）
 *
 * @deprecated 请使用 getRegistry().getByType('local' | 'remote').chat()
 * 此文件保留仅为兼容旧调用方，内部委托给新 Provider
 */

import type { ChatMessage } from '../../../types/chat.js';
import { getRegistry } from './providers/registry.js';

/** @deprecated 使用 getRegistry().getByType('local').chat() */
export async function callLocalModel(messages: ChatMessage[], signal?: AbortSignal) {
  const provider = getRegistry().getByType('local');
  return provider.chat(messages, { signal });
}

/** @deprecated 使用 getRegistry().getByType('remote').chat() */
export async function callVolcengineModel(messages: ChatMessage[], signal?: AbortSignal) {
  const provider = getRegistry().getByType('remote');
  return provider.chat(messages, { signal, temperature: 0.7, maxTokens: 4000, topP: 0.95 });
}

