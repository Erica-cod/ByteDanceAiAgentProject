/**
 * Ollama JSON 行流解析器
 *
 * 根据 ModelConfig 中的格式配置自动适配不同模型的流式输出：
 *
 *   thinkingMode='field':  独立字段模式（如 qwen3 的 message.thinking）
 *     → thinkingField 指定字段名，默认 'thinking'，也可能是 'reasoning' 等
 *   thinkingMode='tags':   XML 标签模式（如 deepseek-r1 的 <think>...</think>）
 *     → thinkingTag 指定标签名，默认 'think'，也可能是 'Imaging' 等
 *   thinkingMode='none':   无 thinking，纯 content
 *
 *   toolCallsInStream=true:  tool_calls 可能在 done=false 消息中出现（如 qwen3）
 *   toolCallsInStream=false: tool_calls 只在 done=true 消息中出现（传统行为）
 */

import type { StreamParser, ParsedChunk, ThinkingMode } from '../providers/types.js';
import { extractThinkingAndContent } from '../../../shared/utils/content-extractor.js';

export interface OllamaParserConfig {
  thinkingMode: ThinkingMode;
  /** field 模式下 message 对象中的字段名，默认 'thinking' */
  thinkingField: string;
  /** tags 模式下的 XML 标签名，默认 'think' */
  thinkingTag: string;
  toolCallsInStream: boolean;
}

export class OllamaStreamParser implements StreamParser {
  private config: OllamaParserConfig;
  private pendingToolCalls: Array<{ name: string; arguments: Record<string, any> }> = [];
  private accumulatedContent = '';
  private accumulatedThinking = '';

  constructor(config?: Partial<OllamaParserConfig>) {
    this.config = {
      thinkingMode: config?.thinkingMode ?? 'none',
      thinkingField: config?.thinkingField ?? 'thinking',
      thinkingTag: config?.thinkingTag ?? 'think',
      toolCallsInStream: config?.toolCallsInStream ?? false,
    };
  }

  parseLine(line: string): ParsedChunk | null {
    if (!line.trim()) return null;

    let data: any;
    try {
      data = JSON.parse(line);
    } catch {
      return null;
    }

    const result: ParsedChunk = { done: false };

    // ── thinking 处理（field 模式：读取可配置的字段名） ──
    if (this.config.thinkingMode === 'field') {
      const fieldValue = data.message?.[this.config.thinkingField];
      if (fieldValue) {
        this.accumulatedThinking += fieldValue;
        result.thinking = this.accumulatedThinking;
      }
    }

    // ── content 处理 ──
    if (data.message?.content) {
      this.accumulatedContent += data.message.content;

      if (this.config.thinkingMode === 'tags') {
        // tags 模式：用可配置的标签名提取
        const extracted = extractThinkingAndContent(this.accumulatedContent, this.config.thinkingTag);
        result.thinking = extracted.thinking || undefined;
        result.content = extracted.content || undefined;
      } else {
        result.content = data.message.content;
        if (this.accumulatedThinking) {
          result.thinking = this.accumulatedThinking;
        }
      }
    } else if (result.thinking && !result.content) {
      // thinking-only 的 chunk（field 模式下 content 为空时），仍然返回 thinking
    }

    // ── tool_calls 处理（在任意消息中检测并累积） ──
    const toolCalls = data.message?.tool_calls;
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      for (const tc of toolCalls) {
        const name = tc.function?.name;
        if (!name) continue;
        const args = typeof tc.function.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments || {};
        this.pendingToolCalls.push({ name, arguments: args });
      }
    }

    // ── done 处理 ──
    if (data.done) {
      result.done = true;

      if (this.pendingToolCalls.length > 0) {
        result.finishReason = 'tool_calls';
        result.completeToolCalls = [...this.pendingToolCalls];
      } else {
        result.finishReason = 'stop';
      }

      // tags 模式下最终提取一次，确保闭合标签后的 content 被正确返回
      if (this.config.thinkingMode === 'tags' && this.accumulatedContent) {
        const extracted = extractThinkingAndContent(this.accumulatedContent, this.config.thinkingTag);
        result.thinking = extracted.thinking || undefined;
        result.content = extracted.content || undefined;
      }
    }

    if (!result.content && !result.thinking && !result.done && !result.completeToolCalls) {
      return null;
    }

    return result;
  }

  /** 获取累积的全部 content 文本（用于保存消息） */
  getAccumulatedContent(): string {
    if (this.config.thinkingMode === 'tags' && this.accumulatedContent) {
      return extractThinkingAndContent(this.accumulatedContent, this.config.thinkingTag).content;
    }
    return this.accumulatedContent;
  }

  /** 获取累积的全部 thinking 文本 */
  getAccumulatedThinking(): string {
    if (this.config.thinkingMode === 'tags' && this.accumulatedContent) {
      return extractThinkingAndContent(this.accumulatedContent, this.config.thinkingTag).thinking;
    }
    return this.accumulatedThinking;
  }

  /** 获取原始累积内容（含标签，用于数据库存储） */
  getRawAccumulatedContent(): string {
    return this.accumulatedContent;
  }

  reset(): void {
    this.pendingToolCalls = [];
    this.accumulatedContent = '';
    this.accumulatedThinking = '';
  }
}
