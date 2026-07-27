/**
 * LLM Provider 模块化架构 - 核心类型定义
 *
 * 两种流协议：
 *   - ollama:      Ollama /api/chat，JSON 行格式
 *   - openai-sse:  OpenAI 兼容 /v1/chat/completions，SSE 格式（火山引擎/vLLM/TGI 等）
 */

import type { ChatMessage } from '../../../../types/chat.js';
import type { FunctionSchema } from '../../../../tools/core/types.js';

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

export type ThinkingMode = 'field' | 'tags' | 'none';

export interface ModelConfig {
  /** 使用的 Provider 类型 */
  provider: ProviderType;
  /** Ollama / API 中的模型名 */
  modelName: string;
  /** 是否支持 Function Calling */
  supportsTools: boolean;
  /** thinking 输出方式：'field'=独立字段, 'tags'=XML标签嵌在content中, 'none'=无 */
  thinkingMode?: ThinkingMode;
  /** 'field' 模式：message 对象中的字段名（默认 'thinking'，如 qwen3 用 'thinking'，其他模型可能用 'reasoning'） */
  thinkingField?: string;
  /** 'tags' 模式：XML 标签名（默认 'think'，即 <think>...</think>，其他模型可能用 'Imaging' 等） */
  thinkingTag?: string;
  /** tool_calls 可能出现在非 done 消息中（如 qwen3） */
  toolCallsInStream?: boolean;
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
  /** thinking 增量内容（来自 message.thinking 字段或 <think> 标签提取） */
  thinking?: string;
  /** 工具调用增量（流式累积） */
  toolCalls?: ToolCallDelta[];
  /** 完整的工具调用（可能来自 done=true 或流式消息） */
  completeToolCalls?: Array<{ name: string; arguments: Record<string, any> }>;
  /** 完成原因 */
  finishReason?: 'stop' | 'tool_calls' | null;
  /** 是否结束 */
  done: boolean;
  /** 供应商在流末尾返回的真实 token 用量。 */
  tokenUsage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface StreamParser {
  /** 解析一行流数据，返回结果和剩余 buffer */
  parseLine(line: string): ParsedChunk | null;

  /** 重置内部状态（用于多轮工具调用时清空累积） */
  reset(): void;
}
