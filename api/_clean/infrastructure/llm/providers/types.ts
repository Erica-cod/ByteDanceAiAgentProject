/**
 * LLM Provider 模块化架构 - 核心类型定义
 *
 * 两种流协议：
 *   - ollama:      Ollama /api/chat，JSON 行格式
 *   - openai-sse:  OpenAI 兼容 /v1/chat/completions，SSE 格式（火山引擎/vLLM/TGI 等）
 */

import type { ChatMessage } from '../../../../types/chat.js';
import type { FunctionSchema } from '../../../../tools/v2/core/types.js';

// ─────────────── 流协议 ───────────────

export type StreamProtocol = 'ollama' | 'openai-sse';

// ─────────────── Provider 接口 ───────────────

export interface LLMProvider {
  readonly name: string;
  readonly streamProtocol: StreamProtocol;

  /** 发起流式聊天请求，返回原始可读流 */
  chat(messages: ChatMessage[], options?: LLMCallOptions): Promise<NodeJS.ReadableStream>;

  /** 当前模型是否支持 Function Calling (tools) */
  supportsTools(): boolean;

  /** 健康检查：服务是否可达 */
  isAvailable(): Promise<boolean>;

  /** 返回当前使用的模型名 */
  getModelName(): string;
}

// ─────────────── 调用选项 ───────────────

export interface LLMCallOptions {
  signal?: AbortSignal;
  tools?: Array<{ type: 'function'; function: FunctionSchema }>;
  tool_choice?: 'auto' | 'none' | 'required';
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

// ─────────────── 模型目录配置 ───────────────

export type ProviderType = 'ollama' | 'openai-compatible';

export interface ModelConfig {
  /** 使用的 Provider 类型 */
  provider: ProviderType;
  /** Ollama / API 中的模型名 */
  modelName: string;
  /** 是否支持 Function Calling */
  supportsTools: boolean;
  /** 预估显存占用（GB），仅本地模型有意义 */
  vramGB?: number;
  /** 模型描述 */
  description: string;
  /** API 地址（可选，覆盖 Provider 默认值） */
  apiUrl?: string;
  /** API Key（可选，覆盖 Provider 默认值） */
  apiKey?: string;
  /** Ollama 特有：keep_alive 参数 */
  keepAlive?: string;
  /** Ollama 特有：GPU 层数 */
  numGpu?: number;
}

// ─────────────── StreamParser ───────────────

export interface ToolCallDelta {
  index: number;
  name?: string;
  arguments?: string;
}

export interface ParsedChunk {
  /** 本次解析到的文本增量 */
  content?: string;
  /** 工具调用增量（流式累积） */
  toolCalls?: ToolCallDelta[];
  /** 完整的工具调用（Ollama 在 done=true 时一次性返回） */
  completeToolCalls?: Array<{ name: string; arguments: Record<string, any> }>;
  /** 完成原因 */
  finishReason?: 'stop' | 'tool_calls' | null;
  /** 是否结束 */
  done: boolean;
}

export interface StreamParser {
  /** 解析一行流数据，返回结果和剩余 buffer */
  parseLine(line: string): ParsedChunk | null;

  /** 重置内部状态（用于多轮工具调用时清空累积） */
  reset(): void;
}
