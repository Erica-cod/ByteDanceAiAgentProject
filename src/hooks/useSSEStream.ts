import { useRef } from 'react';
import { useChatStore, useQueueStore, useUIStore } from '../stores';
import { getConversationDetails, type Conversation } from '../utils/conversationAPI';
import type { RoundData, AgentOutput as MAAgentOutput, HostDecision as MAHostDecision } from '../components/MultiAgentDisplay';

interface UseSSEStreamOptions {
  onConversationCreated?: (convId: string) => void;
}

export function useSSEStream(options: UseSSEStreamOptions = {}) {
  const abortControllerRef = useRef<AbortController | null>(null);

  const userId = useChatStore((s) => s.userId);
  const deviceId = useChatStore((s) => s.deviceId); // ✅ 新增：设备指纹 ID
  const conversationId = useChatStore((s) => s.conversationId);
  const setConversationId = useChatStore((s) => s.setConversationId);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const appendToLastMessage = useChatStore((s) => s.appendToLastMessage);
  const markMessageFailed = useChatStore((s) => s.markMessageFailed);
  const markMessageSuccess = useChatStore((s) => s.markMessageSuccess);
  const saveToCache = useChatStore((s) => s.saveToCache);

  const queueToken = useQueueStore((s) => s.queueToken);
  const setQueueToken = useQueueStore((s) => s.setQueueToken);

  const modelType = useUIStore((s) => s.modelType);
  const chatMode = useUIStore((s) => s.chatMode);

  const sendMessage = async (
    messageText: string,
    userMessageId: string,
    assistantMessageId: string,
    messageCountRefs?: React.MutableRefObject<Map<string, HTMLElement>>
  ) => {
    // SSE 重连配置
    const MAX_RECONNECT_ATTEMPTS = 3;
    const BASE_RETRY_DELAY_MS = 500;
    const MAX_RETRY_DELAY_MS = 5000;

    try {
      // 多agent模式的状态
      let multiAgentRounds: RoundData[] = [];
      let multiAgentStatus: 'in_progress' | 'converged' | 'terminated' = 'in_progress';
      let multiAgentConsensusTrend: number[] = [];
      let currentRound: RoundData | null = null;
      let completedRounds = 0; // ✅ 记录已完成的轮次（用于断点续传）

      let currentContent = '';
      let currentThinking = '';

      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const computeBackoff = (attempt: number) => {
        const exp = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * Math.pow(2, attempt));
        const jitter = Math.floor(Math.random() * 250);
        return exp + jitter;
      };

      const runStreamOnce = async (): Promise<{ completed: boolean; aborted: boolean; retryAfterMs?: number }> => {
        // ✅ 每次重试时动态构建请求体（因为 completedRounds 可能已更新）
        const requestBody = {
          message: messageText,
          modelType: modelType,
          userId: userId,
          deviceId: deviceId || undefined,
          conversationId: conversationId,
          mode: chatMode,
          clientUserMessageId: userMessageId,
          clientAssistantMessageId: assistantMessageId,
          queueToken: queueToken || undefined,
          // ✅ 断点续传：如果是多 agent 模式且有已完成的轮次，传递恢复参数
          ...(chatMode === 'multi_agent' && completedRounds > 0 ? { resumeFromRound: completedRounds + 1 } : {}),
        };

        const signal = abortControllerRef.current?.signal;
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal,
        });

        // 429：队列
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const retryAfterSec = retryAfter ? Number.parseInt(retryAfter, 10) : 1;

          const newQueueToken = response.headers.get('X-Queue-Token');
          const queuePosition = response.headers.get('X-Queue-Position');
          const estimatedWait = response.headers.get('X-Queue-Estimated-Wait');

          if (newQueueToken) {
            setQueueToken(newQueueToken);
            console.log(`🎫 收到队列 token: ${newQueueToken}，位置: ${queuePosition || '未知'}，预估等待: ${estimatedWait || '未知'}秒`);
          }

          if (queuePosition) {
            updateMessage(assistantMessageId, {
              thinking: `排队中，您前面还有 ${queuePosition} 个请求，预计等待 ${estimatedWait || retryAfterSec} 秒...`,
            });
          }

          return { completed: false, aborted: false, retryAfterMs: Math.max(0, retryAfterSec) * 1000 };
        }

        if (!response.ok) {
          throw new Error(`请求失败: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('无法读取响应流');

        const decoder = new TextDecoder();
        let buffer = '';
        let isDone = false;

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

              if (data === '[DONE]') {
                isDone = true;
                break;
              }

              try {
                const parsed = JSON.parse(data);

                // init：同步 conversationId
                if (parsed.type === 'init' && parsed.conversationId) {
                  if (!conversationId) {
                    setConversationId(parsed.conversationId);
                    options.onConversationCreated?.(parsed.conversationId);
                  }
                  if (parsed.mode === 'multi_agent') {
                    multiAgentStatus = 'in_progress';
                  }
                  continue;
                }

                // 多Agent模式事件处理
                if (chatMode === 'multi_agent') {
                  if (parsed.type === 'agent_output') {
                    if (!currentRound || currentRound.round !== parsed.round) {
                      if (currentRound) multiAgentRounds.push(currentRound);
                      currentRound = { round: parsed.round, outputs: [] };
                    }

                    const agentOutput: MAAgentOutput = {
                      agent: parsed.agent,
                      round: parsed.round,
                      output_type: parsed.output_type,
                      content: parsed.content,
                      metadata: parsed.metadata,
                      timestamp: parsed.timestamp,
                    };
                    currentRound.outputs.push(agentOutput);

                    if (parsed.agent === 'reporter') {
                      currentContent = parsed.content;
                    }

                    updateMessage(assistantMessageId, {
                      content: currentContent || '多Agent协作中...',
                      multiAgentData: {
                        rounds: [...multiAgentRounds, currentRound].filter(Boolean) as RoundData[],
                        status: multiAgentStatus,
                        consensusTrend: multiAgentConsensusTrend,
                      },
                    });
                    continue;
                  }

                  if (parsed.type === 'host_decision') {
                    if (currentRound) {
                      const hostDecision: MAHostDecision = {
                        action: parsed.action,
                        reason: parsed.reason,
                        next_agents: parsed.next_agents,
                        consensus_level: parsed.consensus_level,
                        timestamp: parsed.timestamp,
                      };
                      currentRound.hostDecision = hostDecision;
                      if (parsed.consensus_level !== undefined) {
                        multiAgentConsensusTrend.push(parsed.consensus_level);
                      }

                      updateMessage(assistantMessageId, {
                        multiAgentData: {
                          rounds: [...multiAgentRounds, currentRound].filter(Boolean) as RoundData[],
                          status: multiAgentStatus,
                          consensusTrend: multiAgentConsensusTrend,
                        },
                      });
                    }
                    continue;
                  }

                  // ✅ 轮次完成事件（用于断点续传）
                  if (parsed.type === 'round_complete') {
                    completedRounds = parsed.round;
                    console.log(`✅ 第 ${completedRounds} 轮已完成`);
                    continue;
                  }

                  // ✅ 恢复事件（断点续传）
                  if (parsed.type === 'resume') {
                    console.log(`🔄 从第 ${parsed.resumedFromRound} 轮恢复，继续第 ${parsed.continueFromRound} 轮`);
                    completedRounds = parsed.resumedFromRound;
                    updateMessage(assistantMessageId, {
                      thinking: `从第 ${parsed.resumedFromRound} 轮恢复，继续第 ${parsed.continueFromRound} 轮...`,
                    });
                    continue;
                  }

                  if (parsed.type === 'session_complete') {
                    multiAgentStatus = parsed.status;
                    if (currentRound) {
                      multiAgentRounds.push(currentRound);
                      currentRound = null;
                    }
                    updateMessage(assistantMessageId, {
                      content: currentContent || '多Agent协作完成',
                      multiAgentData: {
                        rounds: multiAgentRounds,
                        status: multiAgentStatus,
                        consensusTrend: multiAgentConsensusTrend,
                      },
                    });
                    continue;
                  }

                  if (parsed.type === 'error') {
                    currentContent = `多Agent协作失败: ${parsed.error}`;
                    multiAgentStatus = 'terminated';
                    continue;
                  }
                }

                // 单Agent模式事件处理
                if (parsed.thinking !== undefined && parsed.thinking !== null) {
                  currentThinking = parsed.thinking;
                }
                if (parsed.content !== undefined && parsed.content !== null) {
                  currentContent = parsed.content;
                }

                const currentSources = parsed.sources;

                if (chatMode === 'single') {
                  appendToLastMessage(currentContent, currentThinking, currentSources);
                }
              } catch (e) {
                console.error('解析 SSE 数据失败:', e, '数据:', data);
              }
            }

            if (isDone) break;
          }
        } catch (e: any) {
          if (e?.name === 'AbortError') {
            return { completed: false, aborted: true };
          }
          return { completed: false, aborted: false };
        }

        return { completed: isDone, aborted: false };
      };

      // 断线重连
      let attempt = 0;
      while (true) {
        const result = await runStreamOnce();
        if (result.aborted) {
          throw Object.assign(new Error('AbortError'), { name: 'AbortError' });
        }
        if (result.completed) break;

        if (attempt >= MAX_RECONNECT_ATTEMPTS) {
          throw new Error('SSE 连接中断，已达到最大重试次数');
        }

        const waitMs = result.retryAfterMs ?? computeBackoff(attempt);
        console.warn(`⚠️ SSE 中断/限流，准备第 ${attempt + 1} 次重连，等待 ${waitMs}ms`);

        updateMessage(assistantMessageId, {
          thinking: '连接中断，正在尝试重连...',
        });

        await sleep(waitMs);
        attempt += 1;
      }

      // ✅ 流式处理成功完成
      if (queueToken) {
        console.log(`🎫 清除队列 token: ${queueToken}`);
        setQueueToken(null);
      }

      // 标记消息为成功
      markMessageSuccess(userMessageId);
      markMessageSuccess(assistantMessageId);
      saveToCache();

      // 更新对话列表中的消息计数
      if (conversationId && messageCountRefs) {
        getConversationDetails(userId, conversationId)
          .then((details: Conversation | null) => {
            if (details) {
              const countElement = messageCountRefs.current.get(conversationId);
              if (countElement) {
                countElement.textContent = `${details.messageCount}`;
              }
            }
          })
          .catch((error: unknown) => {
            console.error('更新消息计数失败:', error);
          });
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('请求已取消');
      } else {
        console.error('发送消息失败:', error);
        markMessageFailed(assistantMessageId);
        updateMessage(assistantMessageId, {
          content: '发送消息失败，请重试',
        });
      }
      throw error;
    }
  };

  const abort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const createAbortController = () => {
    abortControllerRef.current = new AbortController();
  };

  return {
    sendMessage,
    abort,
    createAbortController,
    abortControllerRef,
  };
}

