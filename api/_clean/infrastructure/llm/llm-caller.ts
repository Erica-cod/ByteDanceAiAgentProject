/**
 * LLM 模型调用封装（已迁移到 providers/ 模块化架构）
 *
 * @deprecated 请使用 getRegistry().getByType('local' | 'remote').chat()
 * 此文件保留仅为兼容旧调用方（sseHandler/sseLocalHandler/workflowProcessor）
 */

import type { ChatMessage } from '../../../types/chat.js';
import { getRegistry } from './providers/registry.js';

/** @deprecated 使用 getRegistry().getByType('local').chat() */
export async function callLocalModel(messages: ChatMessage[]) {
  const provider = getRegistry().getByType('local');
  return provider.chat(messages);
}

/** @deprecated 使用 getRegistry().getByType('remote').chat() */
export async function callVolcengineModel(messages: ChatMessage[]) {
  const provider = getRegistry().getByType('remote');
  return provider.chat(messages, { temperature: 0.7, maxTokens: 4000, topP: 0.95 });
}

