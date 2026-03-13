/**
 * 多 Agent 模式事件处理器
 */

import type { RoundData, AgentOutput as MAAgentOutput, HostDecision as MAHostDecision } from '../../../components/business/Message/MultiAgentDisplay';
import type { StreamState } from './types';

/**
 * Helper: 深拷贝 rounds 数据，避免 React 状态冻结问题
 */
export function cloneRoundsForReact(rounds: RoundData[], currentRound: RoundData | null): RoundData[] {
  const result = rounds.map((r: RoundData) => ({
    round: r.round,
    outputs: r.outputs.map((o: MAAgentOutput) => ({ ...o })),
    hostDecision: r.hostDecision ? { ...r.hostDecision } : undefined
  }));
  
  if (currentRound) {
    result.push({
      round: currentRound.round,
      outputs: currentRound.outputs.map((o: MAAgentOutput) => ({ ...o })),
      hostDecision: currentRound.hostDecision ? { ...currentRound.hostDecision } : undefined
    });
  }
  
  return result;
}

/**
 * 处理 agent_start 事件
 */
export function handleAgentStart(
  parsed: any,
  state: StreamState,
  updateMessage: (id: string, updates: any) => void,
  assistantMessageId: string
): void {
  const agentId = parsed.agent;
  const round = parsed.round;
  const key = `${agentId}:${round}`;
  
  // 重置该 agent 的流式内容
  state.agentStreamingContent.set(key, '');
  
  console.log(`🚀 [MultiAgent] ${agentId} 开始生成 (第${round}轮)`);
  
  // 立即创建 agent 占位符输出，以便流式显示
  if (!state.currentRound || state.currentRound.round !== round) {
    if (state.currentRound) {
      console.log(`[MultiAgent] ✅ 保存第 ${state.currentRound.round} 轮到历史，包含 ${state.currentRound.outputs.length} 个agent输出`);
      state.multiAgentRounds.push(state.currentRound);
    }
    state.currentRound = { round: round, outputs: [] };
  }
  
  // 检查是否已经存在该 agent 的输出（避免重复）
  const existingOutputIndex = state.currentRound.outputs.findIndex((o: MAAgentOutput) => o.agent === agentId);
  
  if (existingOutputIndex === -1) {
    // 创建占位符输出
    const placeholderOutput: MAAgentOutput = {
      agent: agentId,
      round: round,
      output_type: 'text',
      content: '',
      metadata: {},
      timestamp: new Date().toISOString(),
    };
    
    state.currentRound = {
      ...state.currentRound,
      outputs: [...state.currentRound.outputs, placeholderOutput]
    };
    
    console.log(`[MultiAgent] 📝 第 ${round} 轮添加 ${agentId} 占位符，当前轮次共 ${state.currentRound.outputs.length} 个agent`);
  }
  
  // 更新UI状态
  updateMessage(assistantMessageId, {
    thinking: `${agentId} 正在思考...`,
    streamingAgentContent: Object.fromEntries(state.agentStreamingContent),
    multiAgentData: {
      rounds: cloneRoundsForReact(state.multiAgentRounds, state.currentRound),
      status: state.multiAgentStatus,
      consensusTrend: [...state.multiAgentConsensusTrend],
    },
  });
}

/**
 * 处理 agent_chunk 事件（流式内容）
 */
export function handleAgentChunk(
  parsed: any,
  state: StreamState,
  updateMessage: (id: string, updates: any) => void,
  assistantMessageId: string
): void {
  const agentId = parsed.agent;
  const round = parsed.round;
  const key = `${agentId}:${round}`;
  const currentAgentContent = state.agentStreamingContent.get(key) || '';
  const newContent = currentAgentContent + parsed.chunk;
  state.agentStreamingContent.set(key, newContent);
  
  console.log(`📝 [MultiAgent] ${agentId} 流式输出: ${newContent.length}字符`);
  
  // 如果是 reporter，更新主内容
  if (agentId === 'reporter') {
    state.currentContent = newContent;
  }
  
  // 确保 currentRound 存在且是当前轮次
  if (!state.currentRound || state.currentRound.round !== round) {
    console.warn(`[MultiAgent] ⚠️ agent_chunk 但当前轮次不匹配: 期望${round}, 实际${state.currentRound?.round}`);
    if (state.currentRound) state.multiAgentRounds.push(state.currentRound);
    state.currentRound = { round: round, outputs: [] };
  }
  
  // 实时更新UI（显示流式内容）
  const streamingContentObj = Object.fromEntries(state.agentStreamingContent);
  console.log(`🎨 [MultiAgent] 更新UI，streamingAgentContent keys:`, Object.keys(streamingContentObj));
  
  updateMessage(assistantMessageId, {
    content: state.currentContent || '多Agent协作中...',
    streamingAgentContent: streamingContentObj,
    multiAgentData: {
      rounds: cloneRoundsForReact(state.multiAgentRounds, state.currentRound),
      status: state.multiAgentStatus,
      consensusTrend: [...state.multiAgentConsensusTrend],
    },
  });
}

/**
 * 处理 agent_complete 事件
 */
export function handleAgentComplete(
  parsed: any,
  state: StreamState,
  updateMessage: (id: string, updates: any) => void,
  assistantMessageId: string
): void {
  const agentId = parsed.agent;
  const round = parsed.round;
  const key = `${agentId}:${round}`;
  
  // agent 完成后，删除流式内容标记
  state.agentStreamingContent.delete(key);
  console.log(`✅ [MultiAgent] ${agentId} 完成生成 (第${round}轮)，移除流式标记`);
  
  // 确保当前轮次存在
  if (!state.currentRound || state.currentRound.round !== round) {
    console.log(`[MultiAgent] 🔄 切换到新轮次 ${round}，旧轮次 ${state.currentRound?.round}，输出数: ${state.currentRound?.outputs.length || 0}`);
    if (state.currentRound) {
      console.log(`[MultiAgent] ✅ 保存第 ${state.currentRound.round} 轮到历史，包含 ${state.currentRound.outputs.length} 个agent输出`);
      state.multiAgentRounds.push(state.currentRound);
    }
    state.currentRound = { round: round, outputs: [] };
  }

  // 查找并更新已存在的占位符
  const existingOutputIndex = state.currentRound.outputs.findIndex((o: MAAgentOutput) => o.agent === agentId);
  
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
    const newOutputs = [...state.currentRound.outputs];
    newOutputs[existingOutputIndex] = agentOutput;
    state.currentRound = {
      ...state.currentRound,
      outputs: newOutputs
    };
    console.log(`[MultiAgent] 🔄 第 ${round} 轮更新 ${agentId} 输出（完成）`);
  } else {
    // 不存在则添加（兜底）
    state.currentRound = {
      ...state.currentRound,
      outputs: [...state.currentRound.outputs, agentOutput]
    };
    console.log(`[MultiAgent] 📝 第 ${round} 轮添加 ${agentId} 输出（兜底逻辑）`);
  }
  
  console.log(`[MultiAgent] 📊 当前数据: ${state.currentRound.outputs.map((o: MAAgentOutput) => o.agent).join(' → ')}`);

  if (agentId === 'reporter') {
    state.currentContent = parsed.full_content;
  }

  // 准备传递给 React 的数据
  const allRounds = cloneRoundsForReact(state.multiAgentRounds, state.currentRound);
  console.log(`[MultiAgent] 🚀 传递给React: ${allRounds.length}轮，当前轮${state.currentRound.round}有${state.currentRound.outputs.length}个outputs`);

  updateMessage(assistantMessageId, {
    content: state.currentContent || '多Agent协作中...',
    streamingAgentContent: Object.fromEntries(state.agentStreamingContent),
    multiAgentData: {
      rounds: allRounds,
      status: state.multiAgentStatus,
      consensusTrend: [...state.multiAgentConsensusTrend],
    },
  });
}

/**
 * 处理 agent_output 事件（向后兼容）
 */
export function handleAgentOutput(
  parsed: any,
  state: StreamState,
  updateMessage: (id: string, updates: any) => void,
  assistantMessageId: string
): void {
  if (!state.currentRound || state.currentRound.round !== parsed.round) {
    if (state.currentRound) state.multiAgentRounds.push(state.currentRound);
    state.currentRound = { round: parsed.round, outputs: [] };
  }

  const agentOutput: MAAgentOutput = {
    agent: parsed.agent,
    round: parsed.round,
    output_type: parsed.output_type,
    content: parsed.content,
    metadata: parsed.metadata,
    timestamp: parsed.timestamp,
  };
  
  state.currentRound = {
    ...state.currentRound,
    outputs: [...state.currentRound.outputs, agentOutput]
  };

  if (parsed.agent === 'reporter') {
    state.currentContent = parsed.content;
  }

  updateMessage(assistantMessageId, {
    content: state.currentContent || '多Agent协作中...',
    multiAgentData: {
      rounds: cloneRoundsForReact(state.multiAgentRounds, state.currentRound),
      status: state.multiAgentStatus,
      consensusTrend: [...state.multiAgentConsensusTrend],
    },
  });
}

/**
 * 处理 host_decision 事件
 */
export function handleHostDecision(
  parsed: any,
  state: StreamState,
  updateMessage: (id: string, updates: any) => void,
  assistantMessageId: string
): void {
  if (!state.currentRound) return;
  
  const hostDecision: MAHostDecision = {
    action: parsed.action,
    reason: parsed.reason,
    next_agents: parsed.next_agents,
    consensus_level: parsed.consensus_level,
    timestamp: parsed.timestamp,
  };
  
  state.currentRound = {
    ...state.currentRound,
    hostDecision: hostDecision
  };
  
  if (parsed.consensus_level !== undefined) {
    state.multiAgentConsensusTrend.push(parsed.consensus_level);
  }
  
  console.log(`[MultiAgent] 🎯 第 ${state.currentRound.round} 轮添加Host决策，共识: ${(parsed.consensus_level * 100).toFixed(1)}%`);

  const allRounds = [
    ...state.multiAgentRounds.map((r: RoundData) => ({
      round: r.round,
      outputs: r.outputs.map((o: MAAgentOutput) => ({ ...o })),
      hostDecision: r.hostDecision ? { ...r.hostDecision } : undefined
    })),
    {
      round: state.currentRound.round,
      outputs: state.currentRound.outputs.map((o: MAAgentOutput) => ({ ...o })),
      hostDecision: state.currentRound.hostDecision ? { ...state.currentRound.hostDecision } : undefined
    }
  ];

  updateMessage(assistantMessageId, {
    multiAgentData: {
      rounds: allRounds,
      status: state.multiAgentStatus,
      consensusTrend: [...state.multiAgentConsensusTrend],
    },
  });
}

/**
 * 处理 session_complete 事件
 */
export function handleSessionComplete(
  parsed: any,
  state: StreamState,
  updateMessage: (id: string, updates: any) => void,
  assistantMessageId: string
): void {
  state.multiAgentStatus = parsed.status;
  if (state.currentRound) {
    state.multiAgentRounds.push(state.currentRound);
    state.currentRound = null;
  }
  
  console.log(`[MultiAgent] ✅ 协作完成，共 ${state.multiAgentRounds.length} 轮`);
  
  updateMessage(assistantMessageId, {
    content: state.currentContent || '多Agent协作完成',
    multiAgentData: {
      rounds: cloneRoundsForReact(state.multiAgentRounds, null),
      status: state.multiAgentStatus,
      consensusTrend: [...state.multiAgentConsensusTrend],
    },
  });
}

