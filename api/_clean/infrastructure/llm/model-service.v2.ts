/**
 * 模型调用服务 V2 - 支持 Function Calling
 * 统一管理本地模型和火山引擎模型的调用，支持工具定义传递
 */

import { volcengineService, type VolcengineMessage } from './volcengine-service.js';
import type { ChatMessage } from '../../../types/chat.js';
import type { FunctionSchema } from '../../../tools/v2/core/types.js';

export interface ModelCallOptions {
  signal?: AbortSignal;
  tools?: Array<{ type: 'function'; function: FunctionSchema }>;
  tool_choice?: 'auto' | 'none' | 'required';
}

/**
 * 调用本地 Ollama 模型（V2 - 支持 Function Calling）
 * 
 * 注意：Ollama 支持 Function Calling（从 0.3.0+ 版本开始）
 * 格式与 OpenAI 兼容
 * 
 * @param messages - 对话消息列表
 * @param options - 调用选项（包含 tools 定义）
 */
export async function callLocalModelV2(
  messages: ChatMessage[],
  options: ModelCallOptions = {}
) {
  const fetch = (await import('node-fetch')).default;
  const modelName = process.env.OLLAMA_MODEL || 'deepseek-r1:7b';
  const ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434';
  
  const requestBody: any = {
    model: modelName,
    messages,
    stream: true,
    keep_alive: '30m', // 保持模型在内存中 30 分钟，避免频繁重新加载
    options: {
      num_gpu: 999,  // 强制所有层使用 GPU（999 表示尽可能多）
    }
  };

  // ✅ 如果提供了工具定义，添加到请求中
  if (options.tools && options.tools.length > 0) {
    requestBody.tools = options.tools;
    requestBody.tool_choice = options.tool_choice || 'auto';
    console.log(`🔧 [Ollama] 传递 ${options.tools.length} 个工具定义`);
  }
  
  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal: options.signal as any,
  });

  if (!response.ok) {
    throw new Error(`Ollama API 错误: ${response.statusText}`);
  }

  return response.body;
}

/**
 * 调用火山引擎豆包大模型（V2 - 支持 Function Calling）
 * 
 * 注意：火山引擎豆包支持 Function Calling
 * 
 * @param messages - 对话消息列表
 * @param options - 调用选项（包含 tools 定义）
 */
export async function callVolcengineModelV2(
  messages: ChatMessage[],
  options: ModelCallOptions = {}
) {
  // 转换消息格式（保持兼容）
  const volcengineMessages: VolcengineMessage[] = messages.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));

  console.log('🔥 调用火山引擎豆包模型（V2 - Function Calling）...');
  
  const callOptions: any = {
    temperature: 0.7,
    maxTokens: 4000,
    topP: 0.95,
    signal: options.signal,
  };

  // ✅ 如果提供了工具定义，添加到请求中
  if (options.tools && options.tools.length > 0) {
    // 火山引擎的工具格式与 OpenAI 兼容
    callOptions.tools = options.tools;
    callOptions.tool_choice = options.tool_choice || 'auto';
    console.log(`🔧 [Volcengine] 传递 ${options.tools.length} 个工具定义`);
  }

  const stream = await volcengineService.chat(volcengineMessages, callOptions);

  return stream;
}

