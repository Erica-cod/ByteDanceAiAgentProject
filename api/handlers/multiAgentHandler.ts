/**
 * 多Agent协作处理器
 * 处理多Agent模式的SSE流式响应
 */

import { MultiAgentOrchestrator, type MultiAgentSession } from '../workflows/multiAgentOrchestrator.js';
import { SSEStreamWriter } from '../utils/sseStreamWriter.js';
import type { AgentOutput } from '../agents/baseAgent.js';
import type { HostDecision } from '../agents/hostAgent.js';

// ✅ Clean Architecture
import { getContainer } from '../_clean/di-container.js';

// ✅ 流式控制
import { createRemoteControlledWriter } from '../_clean/infrastructure/streaming/controlled-sse-writer.js';

// =====================================================================
// 已弃用 Redis 版本（保留用于参考）
// 原因：MongoDB 更适合多 Agent 状态保存（低频、持久化、查询能力）
// 详见：docs/ARCHITECTURE_DECISION.md
// =====================================================================
// Redis 相关代码已移除，现在使用 MongoDB 存储 Agent Session 状态

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
  
  // ✅ 使用 SSEStreamWriter 工具类
  const sseWriter = new SSEStreamWriter(writer);
  
  // ✅ 使用受控 SSE Writer（多Agent使用远程配置）
  const controlledWriter = createRemoteControlledWriter(sseWriter);

  // 异步处理多Agent协作
  (async () => {
    try {
      // 首先发送 conversationId（直接发送）
      await controlledWriter.sendDirect({
        conversationId: conversationId,
        type: 'init',
        mode: 'multi_agent',
      });

      // 启动心跳
      sseWriter.startHeartbeat(15000);

      // ✅ 尝试从 MongoDB 恢复状态（断点续传）- 使用 Clean Architecture
      let initialState: any = undefined;
      let actualResumeFromRound: number | undefined = resumeFromRound;
      
      if (resumeFromRound && resumeFromRound > 1 && clientAssistantMessageId) {
        try {
          const container = getContainer();
          const loadSessionUseCase = container.getLoadSessionUseCase();
          
          const result = await loadSessionUseCase.execute({
            conversationId,
            userId,
            assistantMessageId: clientAssistantMessageId,
          });
          
          if (result.found && result.data && result.data.completedRounds >= resumeFromRound - 1) {
            initialState = result.data.sessionState;
            actualResumeFromRound = result.data.completedRounds + 1;
            console.log(`🔄 [MultiAgent] 从 MongoDB 恢复状态，将从第 ${actualResumeFromRound} 轮继续`);
            
            // 通知前端恢复状态（直接发送）
            await controlledWriter.sendDirect({
              type: 'resume',
              resumedFromRound: result.data.completedRounds,
              continueFromRound: actualResumeFromRound,
              timestamp: new Date().toISOString(),
            });
          } else {
            console.log(`⚠️  [MultiAgent] MongoDB 中未找到可用状态，将从头开始`);
            actualResumeFromRound = undefined;
          }
        } catch (error) {
          console.error('❌ [MultiAgent] 从 MongoDB 恢复状态失败:', error);
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
          // ✅ 传递连接检查器（防止前端刷新后继续浪费token）
          connectionChecker: () => !sseWriter.isClosed(),
        },
        {
          // ✅ 新增：Agent开始回调（流式显示）
          onAgentStart: async (agentId: string, round: number) => {
            if (sseWriter.isClosed()) return;
            
            console.log(`🚀 [SSE] Agent开始: ${agentId} (第${round}轮)`);
            
            await controlledWriter.sendDirect({
              type: 'agent_start',
              agent: agentId,
              round: round,
              timestamp: new Date().toISOString(),
            });
          },
          
          // ✅ 新增：Agent chunk回调（流式内容）
          // 多Agent模式的chunk已经是流式的，直接发送即可
          onAgentChunk: async (agentId: string, round: number, chunk: string) => {
            if (sseWriter.isClosed()) return;
            
            await controlledWriter.sendDirect({
              type: 'agent_chunk',
              agent: agentId,
              round: round,
              chunk: chunk,
              timestamp: new Date().toISOString(),
            });
          },
          
          // ✅ 修改：Agent完成回调（发送完整内容用于保存）
          onAgentComplete: async (output: AgentOutput) => {
            if (sseWriter.isClosed()) return;
            
            console.log(`✅ [SSE] Agent完成: ${output.agent_id}`);
            
            await controlledWriter.sendDirect({
              type: 'agent_complete',
              agent: output.agent_id,
              round: output.round,
              full_content: output.content,
              metadata: output.metadata,
              timestamp: output.timestamp,
            });
          },

          // Host决策回调
          onHostDecision: async (decision: HostDecision, analysis: any) => {
            if (sseWriter.isClosed()) return;
            
            console.log(`📤 [SSE] 发送Host决策: ${decision.action}`);
            
            await controlledWriter.sendDirect({
              type: 'host_decision',
              action: decision.action,
              reason: decision.reason,
              next_agents: decision.next_agents,
              consensus_level: analysis.consensus_level,
              timestamp: new Date().toISOString(),
            });
          },

          // 轮次完成回调
          onRoundComplete: async (round: number) => {
            console.log(`📤 [SSE] 第 ${round} 轮完成`);
            
            // ✅ 保存当前状态到 MongoDB（断点续传）- 使用 Clean Architecture
            // 🔴 关键修复：即使客户端断开连接，也要保存状态！
            if (clientAssistantMessageId) {
              try {
                const container = getContainer();
                const saveSessionUseCase = container.getSaveSessionUseCase();
                const currentSession = orchestrator.getSession();
                
                await saveSessionUseCase.execute({
                  conversationId,
                  userId,
                  assistantMessageId: clientAssistantMessageId,
                  completedRounds: round,
                  sessionState: currentSession,
                  userQuery: userQuery,
                });
              } catch (error) {
                console.error('❌ [MultiAgent] 保存状态到 MongoDB 失败:', error);
              }
            }
            
            // 只有连接还在时才发送 SSE 事件
            if (sseWriter.isClosed()) {
              console.log(`⚠️  [SSE] 客户端已断开，但状态已保存到 MongoDB (第 ${round} 轮)`);
              return;
            }
            
            await controlledWriter.sendDirect({
              type: 'round_complete',
              round,
              timestamp: new Date().toISOString(),
            });
          },

          // 会话完成回调
          onSessionComplete: async (session: MultiAgentSession) => {
            console.log(`📤 [SSE] 多Agent会话完成`);
            
            // 🔴 关键修复：即使客户端断开连接，也要保存最终报告到数据库！
            try {
              const reporterOutput = session.agents.reporter.last_output;
              if (reporterOutput) {
                // ✅ Clean Architecture
                const container = getContainer();
                const createMessageUseCase = container.getCreateMessageUseCase();
                const updateConversationUseCase = container.getUpdateConversationUseCase();
                
                await createMessageUseCase.execute(
                  conversationId,
                  userId,
                  'assistant',
                  reporterOutput.content,
                  clientAssistantMessageId,
                  'volcano',
                  undefined
                );
                
                const conversation = await container.getGetConversationUseCase().execute(conversationId, userId);
                if (conversation) {
                  await updateConversationUseCase.execute(
                    conversationId,
                    userId,
                    { messageCount: conversation.messageCount + 1 }
                  );
                }
                
                console.log('✅ 多Agent最终报告已保存到数据库');
              }
            } catch (dbError) {
              console.error('❌ 保存多Agent报告失败:', dbError);
            }

            // ✅ 删除 MongoDB 中的状态（会话已完成）- 使用 Clean Architecture
            if (clientAssistantMessageId) {
              try {
                const container = getContainer();
                const deleteSessionUseCase = container.getDeleteSessionUseCase();
                
                await deleteSessionUseCase.execute({
                  conversationId,
                  userId,
                  assistantMessageId: clientAssistantMessageId,
                });
              } catch (error) {
                console.error('❌ [MultiAgent] 删除 MongoDB 状态失败:', error);
              }
            }

            // 只有连接还在时才发送 SSE 事件
            if (sseWriter.isClosed()) {
              console.log(`⚠️  [SSE] 客户端已断开，但最终报告已保存到数据库`);
              return;
            }

            await controlledWriter.sendDirect({
              type: 'session_complete',
              status: session.status,
              rounds: session.current_round,
              consensus_trend: session.consensus_trend,
              timestamp: new Date().toISOString(),
            });
          },
        }
      );

      // 运行多Agent协作
      console.log('🚀 [MultiAgent] 开始运行多Agent协作...');
      await orchestrator.run(userQuery, actualResumeFromRound);

      // 关闭SSE流
      await sseWriter.close();
      console.log('✅ [MultiAgent] 多Agent协作完成，SSE流正常关闭');
      
    } catch (error: any) {
      console.error('❌ [MultiAgent] 多Agent协作失败:', error);
      
      // 如果连接还在，发送错误信息
      if (!sseWriter.isClosed()) {
        try {
          await controlledWriter.sendDirect({
            type: 'error',
            error: error.message,
            timestamp: new Date().toISOString(),
          });
        } catch (writeError) {
          console.error('❌ 发送错误信息失败:', writeError);
        }
      }
      
      // 关闭流
      await sseWriter.close();
    } finally {
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

