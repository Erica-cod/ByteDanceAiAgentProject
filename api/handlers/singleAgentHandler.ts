/**
 * 单 Agent 流处理器 — 统一 SSE 骨架
 *
 * 通过 StreamAdapter 接口抹平 OpenAI SSE 格式与 Ollama JSON 行格式的差异，
 * 工具调用循环、消息保存、metrics 上报只写一份。
 */

import { SSEStreamWriter } from '../utils/sseStreamWriter.js';
import { extractThinkingAndContent } from '../_clean/shared/utils/content-extractor.js';
import { getContainer } from '../_clean/di-container.js';
import type { ChatMessage } from '../types/chat.js';
import {
  createLocalControlledWriter,
  createRemoteControlledWriter,
} from '../_clean/infrastructure/streaming/controlled-sse-writer.js';
import { StreamProgressManager } from '../_clean/infrastructure/streaming/stream-progress-manager.js';
import { toolRegistry, toolExecutor } from '../tools/index.js';
import { callLocalModel, callVolcengineModel } from '../_clean/infrastructure/llm/model-service.js';
import type { StreamAdapter, ParsedChunk } from './stream-adapter.js';
import { OpenAIStreamAdapter } from './stream-adapter.js';

const MAX_TOOL_DEPTH = 5;

async function saveMessage(
  conversationId: string,
  userId: string,
  content: string,
  clientAssistantMessageId?: string,
  thinking?: string,
  sources?: Array<{ title: string; url: string }>,
  metadata?: { tokens?: number; duration?: number }
): Promise<void> {
  const container = getContainer();
  const createMessageUseCase = container.getCreateMessageUseCase();
  await createMessageUseCase.execute(
    conversationId, userId, 'assistant', content,
    clientAssistantMessageId, undefined, thinking, sources, metadata
  );
}

// ==================== 统一入口 ====================

interface AgentStreamOptions {
  stream: any;
  conversationId: string;
  userId: string;
  modelType: 'local' | 'volcano';
  messages: ChatMessage[];
  clientAssistantMessageId?: string;
  onFinally?: () => void;
  requestText?: string;
  estimatedInputTokens?: number;
  inputBudgetTokens?: number;
  adapter: StreamAdapter;
}

function handleAgentStream(opts: AgentStreamOptions): Response {
  const {
    stream, conversationId, userId, modelType,
    messages, clientAssistantMessageId, onFinally, requestText,
    estimatedInputTokens, inputBudgetTokens,
    adapter,
  } = opts;

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const sseWriter = new SSEStreamWriter(writer);
  const controlledWriter = modelType === 'local'
    ? createLocalControlledWriter(sseWriter)
    : createRemoteControlledWriter(sseWriter);

  const messageId = clientAssistantMessageId || `temp_${Date.now()}`;
  const container = getContainer();
  const streamProgressRepo = container.getStreamProgressRepository();
  const progressManager = new StreamProgressManager(streamProgressRepo, {
    updateIntervalMs: 1000,
    updateCharThreshold: 100,
  });

  let searchSources: Array<{ title: string; url: string }> | undefined;
  let messageSaved = false;
  const streamStartTime = Date.now();
  const accumulatedUsage = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };
  let hasProviderUsage = false;
  let lastCallUsage: ParsedChunk['tokenUsage'];

  async function processStream(currentStream: any, currentAdapter: StreamAdapter, depth: number = 0): Promise<void> {
    if (depth >= MAX_TOOL_DEPTH) {
      console.warn(`⚠️ 递归深度达到上限 (${MAX_TOOL_DEPTH})，停止`);
      return;
    }

    let buffer = '';

    for await (const chunk of currentStream) {
      if (sseWriter.isClosed()) {
        console.log('⚠️ 客户端已断开连接，停止处理流');
        if (onFinally) onFinally();
        return;
      }

      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const parsed = currentAdapter.parseLine(line);
        if (!parsed) continue;
        if (parsed.tokenUsage) {
          hasProviderUsage = true;
          lastCallUsage = parsed.tokenUsage;
          accumulatedUsage.prompt_tokens +=
            parsed.tokenUsage.prompt_tokens;
          accumulatedUsage.completion_tokens +=
            parsed.tokenUsage.completion_tokens;
          accumulatedUsage.total_tokens +=
            parsed.tokenUsage.total_tokens;
        }

        // ── 内容推送 ──
        if (parsed.content) {
          const accumulated = currentAdapter.getAccumulatedContent();
          const { thinking, content: mainContent } = extractThinkingAndContent(accumulated);

          if (!sseWriter.isClosed()) {
            await controlledWriter.sendEvent(mainContent, {
              thinking: thinking || undefined,
            });
          }

          await progressManager.updateProgress(
            messageId, accumulated,
            { userId, conversationId, modelType, thinking, sources: searchSources }
          );
        }

        // ── done 处理 ──
        if (parsed.done) {
          if (parsed.finishReason === 'tool_calls' && parsed.completeToolCalls?.length) {
            await executeToolCalls(
              parsed.completeToolCalls, currentAdapter, sseWriter, controlledWriter,
              messages, userId, conversationId, clientAssistantMessageId, searchSources,
              (src) => { searchSources = src; }
            );

            if (sseWriter.isClosed()) return;

            console.log('🔄 基于工具结果继续生成...');
            currentAdapter.reset();

            const newStream = modelType === 'local'
              ? await callLocalModel(messages, { tools: toolRegistry.getAllSchemas() })
              : await callVolcengineModel(messages, { tools: toolRegistry.getAllSchemas() });

            await processStream(newStream, currentAdapter, depth + 1);
            return;
          }

          // 正常结束
          const finalContent = currentAdapter.getAccumulatedContent();
          const finalThinking = currentAdapter.getAccumulatedThinking();
          const rawContent = currentAdapter.getRawAccumulatedContent();
          const durationMs = Date.now() - streamStartTime;
          const finalUsage = hasProviderUsage
            ? { ...accumulatedUsage }
            : undefined;
          const tokensUsed = finalUsage?.total_tokens
            || Math.ceil((finalContent.length + finalThinking.length) / 3);

          if (!sseWriter.isClosed() && finalContent) {
            const { thinking, content: mainContent } = extractThinkingAndContent(finalContent);
            await controlledWriter.sendEvent(mainContent, {
              thinking: thinking || undefined,
            });
          }

          // 保存消息
          if (!messageSaved && (finalContent || rawContent)) {
            messageSaved = true;
            try {
              const { thinking } = extractThinkingAndContent(rawContent || finalContent);
              await saveMessage(
                conversationId, userId, rawContent || finalContent,
                clientAssistantMessageId, thinking, searchSources,
                { tokens: tokensUsed, duration: durationMs }
              );
              const maintenance =
                container.getConversationMemoryMaintenanceService();
              void maintenance.recordTurnAndSchedule({
                conversationId,
                userId,
                requestText: requestText || '',
                responseText: rawContent || finalContent,
                usage: finalUsage
                  ? {
                      ...finalUsage,
                      // Pressure means the last actual model input, while
                      // total_tokens remains the billable sum across tool hops.
                      prompt_tokens:
                        lastCallUsage?.prompt_tokens ??
                        finalUsage.prompt_tokens,
                    }
                  : undefined,
                estimatedInputTokens:
                  estimatedInputTokens ??
                  Math.ceil(
                    messages.reduce(
                      (total, message) =>
                        total + message.content.length,
                      0
                    ) / 3
                  ),
                inputBudgetTokens,
              }).catch(error => {
                console.warn(
                  '[MemorySummary] failed to record/schedule turn',
                  error
                );
              });
              console.log(`💾 消息已保存${searchSources ? ` (含 ${searchSources.length} 个来源)` : ''}`);
            } catch (error) {
              console.error('❌ 保存消息失败:', error);
            }
          }

          // 上报 metrics
          try {
            const recordMetric = container.getRecordMetricUseCase();
            await recordMetric.execute({ type: 'llm_request', durationMs, tokensUsed });
            console.log(`📊 [Token] ${finalUsage ? `用量: ${tokensUsed}` : `估算: ~${tokensUsed}`} tokens, duration=${durationMs}ms`);
          } catch (metricsErr) {
            console.warn('⚠️ 上报 metrics 失败:', metricsErr);
          }

          // 发送完成信号
          if (!sseWriter.isClosed()) {
            await controlledWriter.sendDirect({
              done: true,
              assistantMessageId: clientAssistantMessageId,
              sources: searchSources,
              tokenUsage: finalUsage,
            });
          }
          return;
        }
      }
    }

    // 处理 buffer 中可能残留的最后一行
    if (buffer.trim()) {
      currentAdapter.parseLine(buffer);
    }
  }

  // 异步处理流
  (async () => {
    try {
      if (!sseWriter.isClosed()) {
        await controlledWriter.sendDirect({
          conversationId,
          assistantMessageId: clientAssistantMessageId,
          type: 'init',
        });
      }
      sseWriter.startHeartbeat(15000);
      await processStream(stream, adapter);
    } catch (error: any) {
      console.error('❌ 流处理错误:', error);
      if (!sseWriter.isClosed()) {
        await controlledWriter.sendDirect({ error: '处理失败', message: error.message });
      }
    } finally {
      sseWriter.stopHeartbeat();

      const finalContent = adapter.getAccumulatedContent();
      if (!messageSaved && finalContent?.trim()) {
        try {
          await saveMessage(
            conversationId, userId, adapter.getRawAccumulatedContent(),
            clientAssistantMessageId, adapter.getAccumulatedThinking(), searchSources
          );
        } catch (dbError) {
          console.error('❌ [Finally] 保存不完整回答失败:', dbError);
        }
      }

      await sseWriter.close();
      if (onFinally) onFinally();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// ==================== 工具调用执行（共享） ====================

async function executeToolCalls(
  toolCalls: Array<{ name: string; arguments: any }>,
  adapter: StreamAdapter,
  sseWriter: SSEStreamWriter,
  controlledWriter: any,
  messages: ChatMessage[],
  userId: string,
  conversationId: string,
  clientAssistantMessageId: string | undefined,
  searchSources: Array<{ title: string; url: string }> | undefined,
  setSources: (src: Array<{ title: string; url: string }>) => void
): Promise<void> {
  console.log(`🔧 开始执行 ${toolCalls.length} 个工具调用`);
  const accContent = adapter.getAccumulatedContent();

  for (const tc of toolCalls) {
    if (sseWriter.isClosed()) {
      console.log('⚠️ 客户端已断开，跳过工具执行');
      return;
    }

    console.log(`🔧 执行工具: ${tc.name}`, tc.arguments);
    await controlledWriter.sendEvent('正在执行工具...', {
      toolCall: { tool: tc.name, ...tc.arguments },
    });

    const context = {
      userId, conversationId,
      requestId: clientAssistantMessageId || `req_${Date.now()}`,
      timestamp: Date.now(),
    };

    const result = await toolExecutor.execute(tc.name, tc.arguments, context);

    if (!result.success) {
      console.error(`❌ 工具执行失败: ${result.error}`);
      messages.push(
        { role: 'assistant', content: accContent || `使用工具 ${tc.name}` },
        { role: 'user', content: `工具执行失败: ${result.error}` }
      );
    } else {
      console.log(`✅ 工具执行成功 (${result.duration}ms, 缓存: ${result.fromCache})`);

      if (result.sources && Array.isArray(result.sources)) {
        setSources(result.sources);
        console.log(`📎 已保存 ${result.sources.length} 个搜索来源`);
      }

      const resultText = typeof result.data === 'string'
        ? result.data
        : JSON.stringify(result.data, null, 2);

      messages.push(
        { role: 'assistant', content: accContent || `使用工具 ${tc.name}` },
        { role: 'user', content: `工具执行结果：\n\n${resultText}\n\n请基于这个结果回答用户的问题。` }
      );
    }
  }
}

// ==================== 对外导出（保持向后兼容签名） ====================

export async function handleVolcanoStream(
  stream: any,
  conversationId: string,
  userId: string,
  modelType: 'local' | 'volcano',
  messages: ChatMessage[],
  clientAssistantMessageId?: string,
  onFinally?: () => void,
  requestText?: string,
  estimatedInputTokens?: number,
  inputBudgetTokens?: number
): Promise<Response> {
  return handleAgentStream({
    stream, conversationId, userId, modelType,
    messages, clientAssistantMessageId, onFinally, requestText,
    estimatedInputTokens, inputBudgetTokens,
    adapter: new OpenAIStreamAdapter(),
  });
}

export async function handleLocalStream(
  stream: any,
  conversationId: string,
  userId: string,
  modelType: 'local' | 'volcano',
  messages: ChatMessage[],
  clientAssistantMessageId?: string,
  onFinally?: () => void,
  requestText?: string,
  estimatedInputTokens?: number,
  inputBudgetTokens?: number
): Promise<Response> {
  const { getRegistry } = await import('../_clean/infrastructure/llm/providers/registry.js');
  const registry = getRegistry();
  const provider = registry.getByType('local');
  const parser = registry.getStreamParser(provider);

  // OllamaStreamParser 已经实现了 StreamAdapter 兼容的接口
  const adapter: StreamAdapter = parser as any;

  return handleAgentStream({
    stream, conversationId, userId, modelType,
    messages, clientAssistantMessageId, onFinally, requestText,
    estimatedInputTokens, inputBudgetTokens,
    adapter,
  });
}
