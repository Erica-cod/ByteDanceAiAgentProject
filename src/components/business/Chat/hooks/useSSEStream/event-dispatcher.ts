/**
 * SSE 事件路由分发
 *
 * 将不同类型的 SSE 事件分发到对应的处理器，
 * 使主 hook 无需关心事件分支细节。
 */

import type { StreamState } from './types';
import {
  handleAgentStart,
  handleAgentChunk,
  handleAgentComplete,
  handleAgentOutput,
  handleHostDecision,
  handleSessionComplete,
} from './multi-agent-handlers';
import {
  handleChunkingInit,
  handleChunkingProgress,
  handleChunkingChunk,
} from './chunking-handlers';

interface DispatchContext {
  chatMode: string;
  assistantMessageId: string;
  updateMessage: (id: string, updates: Record<string, unknown>) => void;
}

/**
 * @returns true 表示事件已被处理（调用方应 continue），false 表示未匹配需外部处理
 */
export function dispatchSSEEvent(
  parsed: Record<string, any>,
  state: StreamState,
  ctx: DispatchContext,
): boolean {
  const { chatMode, assistantMessageId, updateMessage } = ctx;

  // Chunking 模式事件
  if (parsed.type === 'chunking_init') {
    handleChunkingInit(parsed, state, updateMessage, assistantMessageId);
    return true;
  }
  if (parsed.type === 'chunking_progress') {
    handleChunkingProgress(parsed, state, updateMessage, assistantMessageId);
    return true;
  }
  if (parsed.type === 'chunking_chunk') {
    handleChunkingChunk(parsed, state, updateMessage, assistantMessageId);
    return true;
  }

  // 多 Agent 模式事件
  if (chatMode === 'multi_agent') {
    if (parsed.type === 'agent_start') {
      handleAgentStart(parsed, state, updateMessage, assistantMessageId);
      return true;
    }
    if (parsed.type === 'agent_chunk') {
      handleAgentChunk(parsed, state, updateMessage, assistantMessageId);
      return true;
    }
    if (parsed.type === 'agent_complete') {
      handleAgentComplete(parsed, state, updateMessage, assistantMessageId);
      return true;
    }
    if (parsed.type === 'agent_output') {
      handleAgentOutput(parsed, state, updateMessage, assistantMessageId);
      return true;
    }
    if (parsed.type === 'host_decision') {
      handleHostDecision(parsed, state, updateMessage, assistantMessageId);
      return true;
    }
    if (parsed.type === 'round_complete') {
      state.completedRounds = parsed.round;
      console.log(`第 ${state.completedRounds} 轮已完成`);
      return true;
    }
    if (parsed.type === 'resume') {
      console.log(`从第 ${parsed.resumedFromRound} 轮恢复，继续第 ${parsed.continueFromRound} 轮`);
      state.completedRounds = parsed.resumedFromRound;
      updateMessage(assistantMessageId, {
        thinking: `从第 ${parsed.resumedFromRound} 轮恢复，继续第 ${parsed.continueFromRound} 轮...`,
      });
      return true;
    }
    if (parsed.type === 'session_complete') {
      handleSessionComplete(parsed, state, updateMessage, assistantMessageId);
      return true;
    }
    if (parsed.type === 'error') {
      state.currentContent = `多Agent协作失败: ${parsed.error}`;
      state.multiAgentStatus = 'terminated';
      return true;
    }
  }

  return false;
}
