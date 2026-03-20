/**
 * useSSEStream - SSE 流式消息处理 Hook
 *
 * 使用 RAF 批处理优化流式渲染性能，减少 10-25% 重渲染。
 * 详细的性能分析、方案对比见 ./README.md
 */

import { useRef, useCallback, useEffect } from 'react';
import { useChatStore, useQueueStore, useUIStore } from '@/stores';
import { getConversationDetails, type Conversation } from '@/utils/conversation/conversationAPI';
import { useRAFBatching } from './raf-batching';
import { handleMessageUpload } from './upload';
import { buildSSERequestBody } from './request-builder';
import { dispatchSSEEvent } from './event-dispatcher';
import type { UseSSEStreamOptions, StreamState, StreamResult } from './types';
import type { StreamTrace } from 'ai-stream-monitor';
import { fetchWithCsrf } from '@/utils/auth/fetchWithCsrf';
import { publishConversationUpdated } from '@/utils/events/crossTabChannel';
import { MAX_RECONNECT_ATTEMPTS, BASE_RETRY_DELAY_MS, MAX_RETRY_DELAY_MS } from '@/constants';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const computeBackoff = (attempt: number) => {
  const exp = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * Math.pow(2, attempt));
  return exp + Math.floor(Math.random() * 250);
};

export function useSSEStream(options: UseSSEStreamOptions = {}) {
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamBufferRef = useRef<Map<string, {
    assistantMessageId: string;
    content: string;
    thinking: string;
    sources?: Array<{ title: string; url: string }>;
    done: boolean;
    timestamp: number;
  }>>(new Map());

  const userId = useChatStore((s) => s.userId);
  const deviceId = useChatStore((s) => s.deviceId);
  const conversationId = useChatStore((s) => s.conversationId);
  const setConversationId = useChatStore((s) => s.setConversationId);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const markMessageFailed = useChatStore((s) => s.markMessageFailed);
  const markMessageSuccess = useChatStore((s) => s.markMessageSuccess);
  const saveToCache = useChatStore((s) => s.saveToCache);

  const queueToken = useQueueStore((s) => s.queueToken);
  const setQueueToken = useQueueStore((s) => s.setQueueToken);

  const modelType = useUIStore((s) => s.modelType);
  const chatMode = useUIStore((s) => s.chatMode);

  const { scheduleMessageUpdate, flushMessageUpdate } = useRAFBatching();

  const notifyConversationUpdated = useCallback((targetConversationId?: string | null) => {
    const convId = targetConversationId || useChatStore.getState().conversationId;
    if (!convId) return;
    publishConversationUpdated(convId);
  }, []);

  // 会话切换时，将缓冲区中的流式数据同步到 UI
  useEffect(() => {
    if (!conversationId) return;
    const pending = streamBufferRef.current.get(conversationId);
    if (!pending) return;

    const chatState = useChatStore.getState();
    const exists = chatState.messages.some((m) => m.id === pending.assistantMessageId);
    if (!exists) {
      chatState.addMessage({
        id: pending.assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: pending.timestamp,
        pendingSync: true,
      });
    }

    chatState.updateMessage(pending.assistantMessageId, {
      content: pending.content,
      thinking: pending.thinking || undefined,
      sources: pending.sources,
    });

    if (pending.done) {
      streamBufferRef.current.delete(conversationId);
    }
  }, [conversationId]);

  // ===== 单 Agent 流式更新闭包 =====
  const makeApplyAssistantUpdate = (
    assistantMessageId: string,
    streamConversationIdRef: { current: string | null },
  ) => (
    content?: string,
    thinking?: string,
    sources?: Array<{ title: string; url: string }>,
  ) => {
    const targetConversationId = streamConversationIdRef.current;
    if (!targetConversationId) return;

    const activeConversationId = useChatStore.getState().conversationId;

    streamBufferRef.current.set(targetConversationId, {
      assistantMessageId,
      content: content ?? '',
      thinking: thinking ?? '',
      sources,
      done: false,
      timestamp: Date.now(),
    });

    if (activeConversationId !== targetConversationId) return;

    const chatState = useChatStore.getState();
    if (!chatState.messages.some((m) => m.id === assistantMessageId)) {
      chatState.addMessage({
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        pendingSync: true,
      });
    }

    updateMessage(assistantMessageId, {
      ...(content !== undefined ? { content } : {}),
      ...(thinking !== undefined ? { thinking } : {}),
      ...(sources !== undefined ? { sources } : {}),
    });
  };

  // ===== SSE 单次流处理 =====
  const runStreamOnce = async (
    state: StreamState,
    assistantMessageId: string,
    requestBody: Record<string, unknown>,
    streamConversationIdRef: { current: string | null },
    trace?: StreamTrace | null,
  ): Promise<StreamResult> => {
    const signal = abortControllerRef.current?.signal;
    const response = await fetchWithCsrf('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const retryAfterSec = retryAfter ? Number.parseInt(retryAfter, 10) : 1;
      const newQueueToken = response.headers.get('X-Queue-Token');
      const queuePosition = response.headers.get('X-Queue-Position');
      const estimatedWait = response.headers.get('X-Queue-Estimated-Wait');

      if (newQueueToken) {
        setQueueToken(newQueueToken);
        console.log(`收到队列 token: ${newQueueToken}，位置: ${queuePosition || '未知'}，预估等待: ${estimatedWait || '未知'}秒`);
      }
      if (queuePosition) {
        updateMessage(assistantMessageId, {
          thinking: `排队中，您前面还有 ${queuePosition} 个请求，预计等待 ${estimatedWait || retryAfterSec} 秒...`,
        });
      }
      return { completed: false, aborted: false, retryAfterMs: Math.max(0, retryAfterSec) * 1000 };
    }

    if (!response.ok) {
      let detail = '';
      try {
        const errJson = await response.json();
        detail = errJson?.error || errJson?.message || '';
      } catch { /* ignore */ }

      if (response.status === 403 && chatMode === 'multi_agent') {
        useUIStore.getState().setChatMode('single');
      }
      throw new Error(`请求失败: ${response.status}${detail ? `，原因：${detail}` : ''}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('无法读取响应流');

    const decoder = new TextDecoder();
    let buffer = '';
    let isDone = false;
    let firstChunkFired = false;
    let inThinkingPhase = false;
    let inGeneratingPhase = false;
    const applyUpdate = makeApplyAssistantUpdate(assistantMessageId, streamConversationIdRef);
    const dispatchCtx = { chatMode, assistantMessageId, updateMessage };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();

          if (data === '[DONE]') { isDone = true; break; }

          try {
            const parsed = JSON.parse(data);

            if (parsed.type) {
              console.log(`📡 [SSE] 收到事件: ${parsed.type}`,
                parsed.agent ? `(agent: ${parsed.agent}, round: ${parsed.round})` : '',
                `chatMode: ${chatMode}`);
            }

            if (parsed.type === 'init' && parsed.conversationId) {
              streamConversationIdRef.current = parsed.conversationId;
              if (!conversationId) {
                setConversationId(parsed.conversationId);
                options.onConversationCreated?.(parsed.conversationId);
              }
              notifyConversationUpdated(parsed.conversationId);
              if (parsed.mode === 'multi_agent') {
                state.multiAgentStatus = 'in_progress';
              }
              continue;
            }

            // StreamTrace: 多 Agent / Chunking 事件也需要追踪
            if (trace && parsed.type) {
              if (parsed.type === 'agent_start') {
                trace.onPhase(`agent:${parsed.agent || 'unknown'}`, 'start');
              } else if (parsed.type === 'agent_chunk') {
                if (!firstChunkFired) {
                  firstChunkFired = true;
                  trace.onFirstChunk();
                }
                trace.onToken();
              } else if (parsed.type === 'agent_complete') {
                trace.onPhase(`agent:${parsed.agent || 'unknown'}`, 'end');
              } else if (parsed.type === 'host_decision') {
                trace.onPhase(`round:${parsed.round ?? state.completedRounds + 1}`, 'end');
              } else if (parsed.type === 'agent_output' && parsed.toolCalls) {
                for (const tc of parsed.toolCalls) {
                  trace.onToolCall(tc.name || tc.tool || 'unknown', tc);
                }
              }
            }

            if (dispatchSSEEvent(parsed, state, dispatchCtx)) continue;

            // StreamTrace: 首个 token（单 Agent）
            if (!firstChunkFired && (parsed.content || parsed.thinking)) {
              firstChunkFired = true;
              trace?.onFirstChunk();
            }

            // StreamTrace: thinking 阶段
            if (parsed.thinking !== undefined && parsed.thinking !== null) {
              if (!inThinkingPhase) {
                inThinkingPhase = true;
                trace?.onPhase('thinking', 'start');
              }
              state.currentThinking = parsed.thinking;
              trace?.onToken();
            }
            if (parsed.content !== undefined && parsed.content !== null) {
              if (inThinkingPhase) {
                inThinkingPhase = false;
                trace?.onPhase('thinking', 'end');
              }
              if (!inGeneratingPhase) {
                inGeneratingPhase = true;
                trace?.onPhase('generating', 'start');
              }
              state.currentContent = parsed.content;
              trace?.onToken();
            }

            // StreamTrace: tool call
            if (parsed.toolCall) {
              trace?.onToolCall(parsed.toolCall.tool || 'unknown', parsed.toolCall);
            }

            if (chatMode === 'single') {
              scheduleMessageUpdate(
                state.currentContent,
                state.currentThinking,
                parsed.sources,
                applyUpdate,
              );
            }
          } catch (e) {
            console.error('解析 SSE 数据失败:', e, '数据:', data);
          }
        }

        if (isDone) break;
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return { completed: false, aborted: true };
      return { completed: false, aborted: false };
    }

    if (inThinkingPhase) trace?.onPhase('thinking', 'end');
    if (inGeneratingPhase) trace?.onPhase('generating', 'end');

    return { completed: isDone, aborted: false };
  };

  // ===== 发送消息（含重连） =====
  const sendMessage = useCallback(async (
    messageText: string,
    userMessageId: string,
    assistantMessageId: string,
    messageCountRefs?: React.MutableRefObject<Map<string, HTMLElement>>,
  ) => {
    const streamConversationIdRef = { current: conversationId };

    const trace = options.monitor?.createStreamTrace({
      messageId: assistantMessageId,
      model: modelType,
    }) ?? null;

    try {
      const uploadPayload = await handleMessageUpload(messageText, userId, {
        updateProgress: (thinking) => updateMessage(assistantMessageId, { thinking }),
        markFailed: () => markMessageFailed(assistantMessageId),
      });

      console.log(` [SSE] 发送消息，当前 chatMode:`, chatMode);

      const state: StreamState = {
        currentContent: '',
        currentThinking: '',
        multiAgentRounds: [],
        multiAgentStatus: 'in_progress',
        multiAgentConsensusTrend: [],
        currentRound: null,
        completedRounds: 0,
        agentStreamingContent: new Map(),
        chunkingTotalChunks: 0,
        chunkingCurrentChunk: 0,
        chunkingStage: 'split',
      };

      const requestBody = buildSSERequestBody({
        uploadPayload, modelType, userId, deviceId,
        conversationId, chatMode, userMessageId, assistantMessageId,
        queueToken, messageText, completedRounds: state.completedRounds,
      });

      trace?.start();

      let attempt = 0;
      while (true) {
        const result = await runStreamOnce(state, assistantMessageId, requestBody, streamConversationIdRef, trace);
        if (result.aborted) throw Object.assign(new Error('AbortError'), { name: 'AbortError' });
        if (result.completed) break;

        if (attempt >= MAX_RECONNECT_ATTEMPTS) {
          throw new Error('SSE 连接中断，已达到最大重试次数');
        }

        const waitMs = result.retryAfterMs ?? computeBackoff(attempt);
        console.warn(`SSE 中断/限流，准备第 ${attempt + 1} 次重连，等待 ${waitMs}ms`);
        updateMessage(assistantMessageId, { thinking: '连接中断，正在尝试重连...' });
        await sleep(waitMs);
        attempt += 1;
      }

      trace?.complete();

      flushMessageUpdate();
      if (streamConversationIdRef.current) {
        const pending = streamBufferRef.current.get(streamConversationIdRef.current);
        if (pending) { pending.done = true; }
      }
      notifyConversationUpdated(streamConversationIdRef.current || conversationId);

      if (queueToken) { setQueueToken(null); }

      markMessageSuccess(userMessageId);
      markMessageSuccess(assistantMessageId);
      saveToCache().catch(err => console.error('保存缓存失败:', err));

      if (conversationId && messageCountRefs) {
        getConversationDetails(userId, conversationId)
          .then((details: Conversation | null) => {
            if (details) {
              const el = messageCountRefs.current.get(conversationId);
              if (el) el.textContent = `${details.messageCount}`;
            }
          })
          .catch((error: unknown) => console.error('更新消息计数失败:', error));
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        trace?.abort();
      } else {
        trace?.error(error);
      }

      flushMessageUpdate();
      if (streamConversationIdRef.current) {
        const pending = streamBufferRef.current.get(streamConversationIdRef.current);
        if (pending) { pending.done = true; }
      }
      notifyConversationUpdated(streamConversationIdRef.current || conversationId);

      if (error.name === 'AbortError') {
        console.log('请求已取消');
      } else {
        console.error('发送消息失败:', error);
        markMessageFailed(assistantMessageId);
        updateMessage(assistantMessageId, { content: '发送消息失败，请重试' });
      }
      throw error;
    }
  }, [
    chatMode, conversationId, deviceId, flushMessageUpdate,
    markMessageFailed, markMessageSuccess, modelType,
    notifyConversationUpdated, options.monitor,
    options.onConversationCreated,
    queueToken, saveToCache, scheduleMessageUpdate,
    setConversationId, setQueueToken, updateMessage, userId,
  ]);

  const abort = useCallback(() => {
    flushMessageUpdate();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, [flushMessageUpdate]);

  const createAbortController = useCallback(() => {
    abortControllerRef.current = new AbortController();
  }, []);

  return { sendMessage, abort, createAbortController, abortControllerRef };
}
