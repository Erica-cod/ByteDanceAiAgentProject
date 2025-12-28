/**
 * 多Agent协作处理器
 * 处理多Agent模式的SSE流式响应
 */

import { MultiAgentOrchestrator, type MultiAgentSession } from '../workflows/multiAgentOrchestrator.js';
import { MessageService } from '../services/messageService.js';
import { ConversationService } from '../services/conversationService.js';
import { isRedisAvailable, saveMultiAgentState, loadMultiAgentState, deleteMultiAgentState } from '../services/redisClient.js';
import type { AgentOutput } from '../agents/baseAgent.js';
import type { HostDecision } from '../agents/hostAgent.js';

/**
 * 处理多Agent协作并转换为SSE流式响应
 */
export async function handleMultiAgentMode(
  userQuery: string,
  userId: string,
  conversationId: string,
  clientAssistantMessageId?: string,
  onFinally?: () => void,
  resumeFromRound?: number // 断点续传：从指定轮次恢复
): Promise<Response> {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  /**
   * SSE 心跳（用于避免反向代理/负载均衡因"空闲超时"断开连接）
   */
  const HEARTBEAT_MS = (() => {
    const n = Number.parseInt(String(process.env.SSE_HEARTBEAT_MS ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : 15000;
  })();

  // 添加连接状态标志
  let isStreamClosed = false;
  
  // 安全的写入辅助函数
  const safeWrite = async (data: string) => {
    if (isStreamClosed) {
      console.warn('⚠️  [SSE] 流已关闭，跳过写入');
      return false;
    }
    
    try {
      await writer.write(encoder.encode(data));
      return true;
    } catch (error: any) {
      if (error.name === 'AbortError' || error.code === 'ABORT_ERR') {
        console.warn('⚠️  [SSE] 客户端关闭了连接');
        isStreamClosed = true;
        return false;
      }
      throw error;
    }
  };

  // 异步处理多Agent协作
  (async () => {
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    try {
      // 首先发送 conversationId
      const initData = JSON.stringify({
        conversationId: conversationId,
        type: 'init',
        mode: 'multi_agent',
      });
      await safeWrite(`data: ${initData}\n\n`);

      // 启动心跳
      heartbeatTimer = setInterval(() => {
        void safeWrite(`: keep-alive\n\n`);
      }, HEARTBEAT_MS);

      // ✅ 尝试从 Redis 恢复状态（断点续传）
      let initialState: any = undefined;
      let actualResumeFromRound: number | undefined = resumeFromRound;
      
      if (resumeFromRound && resumeFromRound > 1 && clientAssistantMessageId) {
        const redisAvailable = await isRedisAvailable();
        if (redisAvailable) {
          const cachedState = await loadMultiAgentState(
            conversationId, 
            clientAssistantMessageId,
            {
              renewTTL: true, // 启用滑动过期（访问时续期）
              maxRounds: 5,   // 用于计算续期后的 TTL
            }
          );
          if (cachedState && cachedState.completedRounds >= resumeFromRound - 1) {
            initialState = cachedState.sessionState;
            actualResumeFromRound = cachedState.completedRounds + 1;
            console.log(`🔄 [MultiAgent] 从 Redis 恢复状态，将从第 ${actualResumeFromRound} 轮继续`);
            
            // 通知前端恢复状态
            await safeWrite(`data: ${JSON.stringify({
              type: 'resume',
              resumedFromRound: cachedState.completedRounds,
              continueFromRound: actualResumeFromRound,
              timestamp: new Date().toISOString(),
            })}\n\n`);
          } else {
            console.log(`⚠️  [MultiAgent] Redis 中未找到可用状态，将从头开始`);
            actualResumeFromRound = undefined;
          }
        } else {
          console.log(`⚠️  [MultiAgent] Redis 不可用，无法恢复状态`);
          actualResumeFromRound = undefined;
        }
      }

      // 创建编排器
      const orchestrator = new MultiAgentOrchestrator(
        {
          maxRounds: 5,
          userId,
          conversationId,
          resumeFromRound: actualResumeFromRound,
          initialState: initialState,
        },
        {
          // Agent输出回调
          onAgentOutput: async (output: AgentOutput) => {
            if (isStreamClosed) return;
            
            console.log(`📤 [SSE] 发送Agent输出: ${output.agent_id}`);
            
            const sseData = JSON.stringify({
              type: 'agent_output',
              agent: output.agent_id,
              round: output.round,
              output_type: output.output_type,
              content: output.content,
              metadata: output.metadata,
              timestamp: output.timestamp,
            });
            
            await safeWrite(`data: ${sseData}\n\n`);
          },

          // Host决策回调
          onHostDecision: async (decision: HostDecision, analysis: any) => {
            if (isStreamClosed) return;
            
            console.log(`📤 [SSE] 发送Host决策: ${decision.action}`);
            
            const sseData = JSON.stringify({
              type: 'host_decision',
              action: decision.action,
              reason: decision.reason,
              next_agents: decision.next_agents,
              consensus_level: analysis.consensus_level,
              timestamp: new Date().toISOString(),
            });
            
            await safeWrite(`data: ${sseData}\n\n`);
          },

          // 轮次完成回调
          onRoundComplete: async (round: number) => {
            console.log(`📤 [SSE] 第 ${round} 轮完成`);
            
            // ✅ 保存当前状态到 Redis（断点续传）
            // 🔴 关键修复：即使客户端断开连接，也要保存状态！
            if (clientAssistantMessageId) {
              const redisAvailable = await isRedisAvailable();
              if (redisAvailable) {
                const currentSession = orchestrator.getSession();
                await saveMultiAgentState(
                  conversationId, 
                  clientAssistantMessageId, 
                  {
                    completedRounds: round,
                    sessionState: currentSession,
                    userQuery: userQuery,
                  },
                  {
                    maxRounds: 5, // 传递最大轮次，用于计算动态 TTL
                    async: true,  // 🚀 使用异步写入，避免阻塞 SSE 流
                  }
                );
              }
            }
            
            // 只有连接还在时才发送 SSE 事件
            if (isStreamClosed) {
              console.log(`⚠️  [SSE] 客户端已断开，但状态已保存到 Redis (第 ${round} 轮)`);
              return;
            }
            
            const sseData = JSON.stringify({
              type: 'round_complete',
              round,
              timestamp: new Date().toISOString(),
            });
            
            await safeWrite(`data: ${sseData}\n\n`);
          },

          // 会话完成回调
          onSessionComplete: async (session: MultiAgentSession) => {
            console.log(`📤 [SSE] 多Agent会话完成`);
            
            // 🔴 关键修复：即使客户端断开连接，也要保存最终报告到数据库！
            try {
              const reporterOutput = session.agents.reporter.last_output;
              if (reporterOutput) {
                await MessageService.addMessage(
                  conversationId,
                  userId,
                  'assistant',
                  reporterOutput.content,
                  clientAssistantMessageId,
                  undefined,
                  'volcano',
                  undefined
                );
                await ConversationService.incrementMessageCount(conversationId, userId);
                console.log('✅ 多Agent最终报告已保存到数据库');
              }
            } catch (dbError) {
              console.error('❌ 保存多Agent报告失败:', dbError);
            }

            // ✅ 删除 Redis 中的状态（会话已完成）
            if (clientAssistantMessageId) {
              const redisAvailable = await isRedisAvailable();
              if (redisAvailable) {
                await deleteMultiAgentState(conversationId, clientAssistantMessageId);
              }
            }

            // 只有连接还在时才发送 SSE 事件
            if (isStreamClosed) {
              console.log(`⚠️  [SSE] 客户端已断开，但最终报告已保存到数据库`);
              return;
            }

            const sseData = JSON.stringify({
              type: 'session_complete',
              status: session.status,
              rounds: session.current_round,
              consensus_trend: session.consensus_trend,
              timestamp: new Date().toISOString(),
            });
            
            await safeWrite(`data: ${sseData}\n\n`);
          },
        }
      );

      // 运行多Agent协作
      console.log('🚀 [MultiAgent] 开始运行多Agent协作...');
      await orchestrator.run(userQuery, actualResumeFromRound);

      // 发送完成信号
      if (!isStreamClosed) {
        await safeWrite('data: [DONE]\n\n');
        await writer.close();
        console.log('✅ [MultiAgent] 多Agent协作完成，SSE流正常关闭');
      } else {
        console.log('⚠️  [MultiAgent] 多Agent协作完成，但客户端已提前关闭连接');
        try {
          await writer.close();
        } catch (e) {
          // 忽略关闭错误
        }
      }
    } catch (error: any) {
      console.error('❌ [MultiAgent] 多Agent协作失败:', error);
      
      // 如果连接还在，发送错误信息
      if (!isStreamClosed) {
        try {
          const errorData = JSON.stringify({
            type: 'error',
            error: error.message,
            timestamp: new Date().toISOString(),
          });
          
          await safeWrite(`data: ${errorData}\n\n`);
          await safeWrite('data: [DONE]\n\n');
        } catch (writeError) {
          console.error('❌ 发送错误信息失败:', writeError);
        }
      }
      
      // 尝试关闭writer
      try {
        await writer.close();
      } catch (closeError) {
        // 忽略关闭错误
      }
    } finally {
      // ✅ 确保清理心跳定时器，避免资源泄漏
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      // ✅ 确保释放并发名额
      try {
        onFinally?.();
      } catch (e) {
        // 忽略释放时的异常，避免影响主流程
      }
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

