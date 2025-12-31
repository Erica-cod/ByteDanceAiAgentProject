/**
 * LLM 模型调用封装
 * 统一管理本地模型和火山引擎模型的调用
 */

import { volcengineService, type VolcengineMessage } from './volcengine-service.js';
import type { ChatMessage } from '../../../types/chat.js';

/**
 * 调用本地 Ollama 模型
 */
export async function callLocalModel(messages: ChatMessage[]) {
  const fetch = (await import('node-fetch')).default;
  const modelName = process.env.OLLAMA_MODEL || 'deepseek-r1:7b';
  const ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434';
  
  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      messages,
      stream: true,
      keep_alive: '30m', // 保持模型在内存中 30 分钟，避免频繁重新加载
      // 强制使用 GPU - 所有层都加载到 GPU
      options: {
        num_gpu: 999,  // 强制所有层使用 GPU（999 表示尽可能多）
      }
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API 错误: ${response.statusText}`);
  }

  return response.body;
}

/**
 * 调用火山引擎豆包大模型
 */
export async function callVolcengineModel(messages: ChatMessage[]) {
  // 转换消息格式（保持兼容）
  const volcengineMessages: VolcengineMessage[] = messages.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));

  console.log('🔥 调用火山引擎豆包模型...');
  const stream = await volcengineService.chat(volcengineMessages, {
    temperature: 0.7,
    maxTokens: 4000,
    topP: 0.95,
  });

  return stream;
}

