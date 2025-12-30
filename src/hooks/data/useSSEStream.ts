import { useRef } from 'react';
import { useChatStore, useQueueStore, useUIStore } from '../../stores';
import { getConversationDetails, type Conversation } from '../../utils/conversationAPI';
import { isLongText } from '../../utils/textUtils';
import type { RoundData, AgentOutput as MAAgentOutput, HostDecision as MAHostDecision } from '../../components/MultiAgentDisplay';

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
      // 🐛 调试：打印当前 chatMode
      console.log(`🎯 [SSE] 发送消息，当前 chatMode:`, chatMode);
      
      // 多agent模式的状态
      let multiAgentRounds: RoundData[] = [];
      let multiAgentStatus: 'in_progress' | 'converged' | 'terminated' = 'in_progress';
      let multiAgentConsensusTrend: number[] = [];
      let currentRound: RoundData | null = null;
      let completedRounds = 0; // ✅ 记录已完成的轮次（用于断点续传）
      
      // ✅ 新增：流式内容累积（每个agent独立累积）
      let agentStreamingContent: Map<string, string> = new Map();

      let currentContent = '';
      let currentThinking = '';
      
      // Chunking 模式的状态
      let chunkingTotalChunks = 0;
      let chunkingCurrentChunk = 0;
      let chunkingStage: 'split' | 'map' | 'reduce' | 'final' = 'split';

      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const computeBackoff = (attempt: number) => {
        const exp = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * Math.pow(2, attempt));
        const jitter = Math.floor(Math.random() * 250);
        return exp + jitter;
      };

      // ✅ Helper: 深拷贝rounds数据，避免React状态冻结问题
      const cloneRoundsForReact = (rounds: RoundData[], currentRound: RoundData | null): RoundData[] => {
        const result = rounds.map(r => ({
          round: r.round,
          outputs: r.outputs.map(o => ({ ...o })),
          hostDecision: r.hostDecision ? { ...r.hostDecision } : undefined
        }));
        
        if (currentRound) {
          result.push({
            round: currentRound.round,
            outputs: currentRound.outputs.map(o => ({ ...o })),
            hostDecision: currentRound.hostDecision ? { ...currentRound.hostDecision } : undefined
          });
        }
        
        return result;
      };

      const runStreamOnce = async (): Promise<{ completed: boolean; aborted: boolean; retryAfterMs?: number }> => {
        // ✅ 检测是否为超长文本
        const longTextDetection = isLongText(messageText);
        const longTextMode = longTextDetection.level === 'hard' || longTextDetection.level === 'soft' 
          ? 'plan_review' 
          : 'off';
        
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
          // ✅ 超长文本处理
          longTextMode,
          ...(longTextMode !== 'off' ? {
            longTextOptions: {
              preferChunking: true,
              maxChunks: 30,
              includeCitations: false,
            }
          } : {}),
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

                // 🐛 调试：无条件打印所有 SSE 事件（用于诊断）
                if (parsed.type) {
                  console.log(`📡 [SSE] 收到事件: ${parsed.type}`, 
                    parsed.agent ? `(agent: ${parsed.agent}, round: ${parsed.round})` : '',
                    `chatMode: ${chatMode}`);
                }

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

                // Chunking 模式事件处理
                if (parsed.type === 'chunking_init') {
                  chunkingTotalChunks = parsed.totalChunks || 0;
                  console.log(`📦 [Chunking] 初始化：共 ${chunkingTotalChunks} 段`);
                  
                  updateMessage(assistantMessageId, {
                    thinking: `检测到超长文本，将分 ${chunkingTotalChunks} 段智能处理...`,
                  });
                  continue;
                }
                
                if (parsed.type === 'chunking_progress') {
                  chunkingStage = parsed.stage || 'split';
                  chunkingCurrentChunk = parsed.chunkIndex || 0;
                  
                  let thinkingText = '';
                  if (chunkingStage === 'split') {
                    thinkingText = '正在智能切分文本...';
                  } else if (chunkingStage === 'map') {
                    thinkingText = `正在分析第 ${chunkingCurrentChunk + 1}/${chunkingTotalChunks} 段...`;
                  } else if (chunkingStage === 'reduce') {
                    thinkingText = '正在合并分析结果...';
                  } else if (chunkingStage === 'final') {
                    thinkingText = '正在生成最终评审报告...';
                  }
                  
                  console.log(`📊 [Chunking] ${thinkingText}`);
                  
                  updateMessage(assistantMessageId, {
                    thinking: thinkingText,
                  });
                  continue;
                }
                
                if (parsed.type === 'chunking_chunk') {
                  const chunkIndex = parsed.chunkIndex || 0;
                  const chunkSummary = parsed.chunkSummary || '';
                  
                  console.log(`✅ [Chunking] 第 ${chunkIndex + 1} 段完成`);
                  
                  // 可选：显示分段摘要（暂时只更新进度）
                  updateMessage(assistantMessageId, {
                    thinking: `已完成 ${chunkIndex + 1}/${chunkingTotalChunks} 段分析...`,
                  });
                  continue;
                }

                // 多Agent模式事件处理
                if (chatMode === 'multi_agent') {
                  // ✅ 新增：agent_start 事件
                  if (parsed.type === 'agent_start') {
                    const agentId = parsed.agent;
                    const round = parsed.round;
                    const key = `${agentId}:${round}`; // ✅ 使用 agent:round 格式，避免不同轮次覆盖
                    // 重置该agent的流式内容
                    agentStreamingContent.set(key, '');
                    
                    console.log(`🚀 [MultiAgent] ${agentId} 开始生成 (第${round}轮)`);
                    
                    // ✅ 关键修复：立即创建 agent 占位符输出，以便流式显示
                    if (!currentRound || currentRound.round !== round) {
                      if (currentRound) {
                        console.log(`[MultiAgent] ✅ 保存第 ${currentRound.round} 轮到历史，包含 ${currentRound.outputs.length} 个agent输出`);
                        multiAgentRounds.push(currentRound);
                      }
                      currentRound = { round: round, outputs: [] };
                    }
                    
                    // 检查是否已经存在该agent的输出（避免重复）
                    const existingOutputIndex = currentRound.outputs.findIndex(o => o.agent === agentId);
                    
                    if (existingOutputIndex === -1) {
                      // 创建占位符输出（空内容，稍后通过 streamingAgentContent 显示）
                      const placeholderOutput: MAAgentOutput = {
                        agent: agentId,
                        round: round,
                        output_type: 'text',
                        content: '',  // 空内容，通过 streamingAgentContent 显示流式内容
                        metadata: {},
                        timestamp: new Date().toISOString(),
                      };
                      
                      currentRound = {
                        ...currentRound,
                        outputs: [...currentRound.outputs, placeholderOutput]
                      };
                      
                      console.log(`[MultiAgent] 📝 第 ${round} 轮添加 ${agentId} 占位符，当前轮次共 ${currentRound.outputs.length} 个agent`);
                    }
                    
                    // 更新UI状态
                    updateMessage(assistantMessageId, {
                      thinking: `${agentId} 正在思考...`,
                      streamingAgentContent: Object.fromEntries(agentStreamingContent),
                      multiAgentData: {
                        rounds: cloneRoundsForReact(multiAgentRounds, currentRound),
                        status: multiAgentStatus,
                        consensusTrend: [...multiAgentConsensusTrend],
                      },
                    });
                    continue;
                  }
                  
                  // ✅ 新增：agent_chunk 事件（流式内容）
                  if (parsed.type === 'agent_chunk') {
                    const agentId = parsed.agent;
                    const round = parsed.round;
                    const key = `${agentId}:${round}`; // ✅ 使用 agent:round 格式
                    const currentAgentContent = agentStreamingContent.get(key) || '';
                    const newContent = currentAgentContent + parsed.chunk;
                    agentStreamingContent.set(key, newContent);
                    
                    console.log(`📝 [MultiAgent] ${agentId} 流式输出: ${newContent.length}字符`);
                    
                    // 如果是reporter，更新主内容
                    if (agentId === 'reporter') {
                      currentContent = newContent;
                    }
                    
                    // ✅ 确保 currentRound 存在且是当前轮次（但不创建新的占位符，agent_start已经创建）
                    if (!currentRound || currentRound.round !== round) {
                      console.warn(`[MultiAgent] ⚠️ agent_chunk 但当前轮次不匹配: 期望${round}, 实际${currentRound?.round}`);
                      if (currentRound) multiAgentRounds.push(currentRound);
                      currentRound = { round: round, outputs: [] };
                    }
                    
                    // 实时更新UI（显示流式内容）
                    const streamingContentObj = Object.fromEntries(agentStreamingContent);
                    console.log(`🎨 [MultiAgent] 更新UI，streamingAgentContent keys:`, Object.keys(streamingContentObj));
                    
                    updateMessage(assistantMessageId, {
                      content: currentContent || '多Agent协作中...',
                      streamingAgentContent: streamingContentObj,
                      multiAgentData: {
                        rounds: cloneRoundsForReact(multiAgentRounds, currentRound),
                        status: multiAgentStatus,
                        consensusTrend: [...multiAgentConsensusTrend],
                      },
                    });
                    continue;
                  }
                  
                  // ✅ 修改：agent_complete 事件（替代原来的agent_output）
                  if (parsed.type === 'agent_complete') {
                    const agentId = parsed.agent;
                    const round = parsed.round;
                    const key = `${agentId}:${round}`; // ✅ 使用 agent:round 格式
                    // ✅ agent完成后，删除流式内容标记（不再需要流式显示）
                    agentStreamingContent.delete(key);
                    console.log(`✅ [MultiAgent] ${agentId} 完成生成 (第${round}轮)，移除流式标记`);
                    
                    // 确保当前轮次存在
                    if (!currentRound || currentRound.round !== round) {
                      console.log(`[MultiAgent] 🔄 切换到新轮次 ${round}，旧轮次 ${currentRound?.round}，输出数: ${currentRound?.outputs.length || 0}`);
                      if (currentRound) {
                        console.log(`[MultiAgent] ✅ 保存第 ${currentRound.round} 轮到历史，包含 ${currentRound.outputs.length} 个agent输出`);
                        multiAgentRounds.push(currentRound);
                      }
                      currentRound = { round: round, outputs: [] };
                    }

                    // ✅ 关键修复：查找并更新已存在的占位符，而不是添加新的
                    const existingOutputIndex = currentRound.outputs.findIndex(o => o.agent === agentId);
                    
                    const agentOutput: MAAgentOutput = {
                      agent: agentId,
                      round: round,
                      output_type: 'text',
                      content: parsed.full_content,
                      metadata: parsed.metadata,
                      timestamp: parsed.timestamp,
                    };
                    
                    if (existingOutputIndex >= 0) {
                      // 更新已存在的输出
                      const newOutputs = [...currentRound.outputs];
                      newOutputs[existingOutputIndex] = agentOutput;
                      currentRound = {
                        ...currentRound,
                        outputs: newOutputs
                      };
                      console.log(`[MultiAgent] 🔄 第 ${round} 轮更新 ${agentId} 输出（完成）`);
                    } else {
                      // 不存在则添加（兜底，理论上不应该走到这里）
                      currentRound = {
                        ...currentRound,
                        outputs: [...currentRound.outputs, agentOutput]
                      };
                      console.log(`[MultiAgent] 📝 第 ${round} 轮添加 ${agentId} 输出（兜底逻辑）`);
                    }
                    
                    console.log(`[MultiAgent] 📊 当前数据: ${currentRound.outputs.map(o => o.agent).join(' → ')}`);

                    if (agentId === 'reporter') {
                      currentContent = parsed.full_content;
                    }

                    // ✅ 准备传递给React的数据
                    const allRounds = cloneRoundsForReact(multiAgentRounds, currentRound);
                    console.log(`[MultiAgent] 🚀 传递给React: ${allRounds.length}轮，当前轮${currentRound.round}有${currentRound.outputs.length}个outputs`);

                    updateMessage(assistantMessageId, {
                      content: currentContent || '多Agent协作中...',
                      streamingAgentContent: Object.fromEntries(agentStreamingContent),
                      multiAgentData: {
                        rounds: allRounds,
                        status: multiAgentStatus,
                        consensusTrend: [...multiAgentConsensusTrend],
                      },
                    });
                    continue;
                  }
                  
                  // ⚠️ 保留向后兼容：agent_output 事件（如果后端没更新）
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
                    
                    // ✅ 关键修复：创建新的对象副本
                    currentRound = {
                      ...currentRound,
                      outputs: [...currentRound.outputs, agentOutput]
                    };

                    if (parsed.agent === 'reporter') {
                      currentContent = parsed.content;
                    }

                    updateMessage(assistantMessageId, {
                      content: currentContent || '多Agent协作中...',
                      multiAgentData: {
                        rounds: cloneRoundsForReact(multiAgentRounds, currentRound),
                        status: multiAgentStatus,
                        consensusTrend: [...multiAgentConsensusTrend],
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
                      
                      // ✅ 关键修复：创建新的对象副本，避免对象被冻结
                      currentRound = {
                        ...currentRound,
                        hostDecision: hostDecision
                      };
                      
                      if (parsed.consensus_level !== undefined) {
                        multiAgentConsensusTrend.push(parsed.consensus_level);
                      }
                      
                      console.log(`[MultiAgent] 🎯 第 ${currentRound.round} 轮添加Host决策，共识: ${(parsed.consensus_level * 100).toFixed(1)}%`);

                      // ✅ 准备传递给React的数据
                      const allRounds = [
                        ...multiAgentRounds.map(r => ({
                          round: r.round,
                          outputs: r.outputs.map(o => ({ ...o })),
                          hostDecision: r.hostDecision ? { ...r.hostDecision } : undefined
                        })),
                        {
                          round: currentRound.round,
                          outputs: currentRound.outputs.map(o => ({ ...o })),
                          hostDecision: currentRound.hostDecision ? { ...currentRound.hostDecision } : undefined
                        }
                      ];

                      updateMessage(assistantMessageId, {
                        multiAgentData: {
                          rounds: allRounds,
                          status: multiAgentStatus,
                          consensusTrend: [...multiAgentConsensusTrend],
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
                    
                    console.log(`[MultiAgent] ✅ 协作完成，共 ${multiAgentRounds.length} 轮`);
                    
                    updateMessage(assistantMessageId, {
                      content: currentContent || '多Agent协作完成',
                      multiAgentData: {
                        rounds: cloneRoundsForReact(multiAgentRounds, null),
                        status: multiAgentStatus,
                        consensusTrend: [...multiAgentConsensusTrend],
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

