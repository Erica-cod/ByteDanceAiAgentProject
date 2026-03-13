import type { Message } from '../../stores/chatStore';
import type { RoundData } from '../../components/business/Message/MultiAgentDisplay';

interface BuildPerfMockOptions {
  messageCount?: number;
  multiAgentMessageCount?: number;
  roundsPerDiscussion?: number;
  agentContentParagraphs?: number;
}

function buildAgentMarkdown(
  agent: 'planner' | 'critic' | 'host',
  round: number,
  paragraphs: number
): string {
  const title =
    agent === 'planner'
      ? `### 规划师第 ${round} 轮方案`
      : agent === 'critic'
        ? `### 批评家第 ${round} 轮审查`
        : `### 主持人第 ${round} 轮决策`;

  const paragraphBlock = Array.from({ length: paragraphs })
    .map((_, index) => {
      const section = index + 1;
      return [
        `#### 观点段落 ${section}`,
        '- 背景：评估用户目标与当前资源约束。',
        '- 依据：结合历史对话、可执行性和风险边界。',
        '- 输出：给出可落地步骤，并附带优先级和检查点。',
        '',
        '```text',
        `round=${round}; agent=${agent}; section=${section}; confidence=0.${80 + (section % 19)}`,
        '```',
      ].join('\n');
    })
    .join('\n\n');

  return `${title}\n\n${paragraphBlock}`;
}

function buildRounds(roundsPerDiscussion: number, paragraphs: number): RoundData[] {
  const now = Date.now();
  const trend: number[] = [];
  const rounds: RoundData[] = [];

  for (let round = 1; round <= roundsPerDiscussion; round += 1) {
    const consensus = Math.min(0.65 + round * 0.06, 0.96);
    trend.push(consensus);

    rounds.push({
      round,
      outputs: [
        {
          agent: 'planner',
          round,
          output_type: 'text',
          content: buildAgentMarkdown('planner', round, paragraphs),
          metadata: { score: 0.82 + round * 0.02 },
          timestamp: new Date(now + round * 1000).toISOString(),
        },
        {
          agent: 'critic',
          round,
          output_type: 'text',
          content: buildAgentMarkdown('critic', round, paragraphs),
          metadata: { score: 0.76 + round * 0.02 },
          timestamp: new Date(now + round * 1000 + 200).toISOString(),
        },
        {
          agent: 'host',
          round,
          output_type: 'text',
          content: buildAgentMarkdown('host', round, Math.max(1, paragraphs - 1)),
          metadata: { score: 0.8 + round * 0.02 },
          timestamp: new Date(now + round * 1000 + 400).toISOString(),
        },
      ],
      hostDecision: {
        action: round === roundsPerDiscussion ? 'converge' : 'continue',
        reason:
          round === roundsPerDiscussion
            ? '主要分歧已收敛，进入最终报告阶段。'
            : '仍有执行细节与风险点需要继续讨论。',
        next_agents: round === roundsPerDiscussion ? ['reporter'] : ['planner', 'critic'],
        consensus_level: consensus,
        timestamp: new Date(now + round * 1000 + 800).toISOString(),
      },
    });
  }

  return rounds;
}

export function buildMultiAgentPerfMock(
  options: BuildPerfMockOptions = {}
): { conversationId: string; messages: Message[] } {
  const messageCount = options.messageCount ?? 30;
  const multiAgentMessageCount = options.multiAgentMessageCount ?? 6;
  const roundsPerDiscussion = options.roundsPerDiscussion ?? 5;
  const paragraphs = options.agentContentParagraphs ?? 4;
  const conversationId = 'perf-mock-conversation';

  const rounds = buildRounds(roundsPerDiscussion, paragraphs);
  const consensusTrend = rounds.map((round) => round.hostDecision?.consensus_level ?? 0.8);

  const now = Date.now();
  const messages: Message[] = [];

  for (let i = 0; i < messageCount; i += 1) {
    const ts = now - (messageCount - i) * 15_000;
    const isAssistant = i % 2 === 1;
    const isMulti = isAssistant && i >= messageCount - multiAgentMessageCount * 2;

    if (!isAssistant) {
      messages.push({
        id: `perf-user-${i}`,
        role: 'user',
        content: `这是性能测试输入消息 ${i + 1}，用于模拟历史对话。`,
        timestamp: ts,
      });
      continue;
    }

    if (isMulti) {
      messages.push({
        id: `perf-assistant-multi-${i}`,
        role: 'assistant',
        content: '多 Agent 协作完成，点击展开可查看完整讨论过程。',
        timestamp: ts,
        multiAgentData: {
          rounds: rounds.map((round) => ({
            ...round,
            outputs: round.outputs.map((output) => ({ ...output })),
            hostDecision: round.hostDecision ? { ...round.hostDecision } : undefined,
          })),
          status: 'converged',
          consensusTrend: [...consensusTrend],
        },
      });
      continue;
    }

    messages.push({
      id: `perf-assistant-${i}`,
      role: 'assistant',
      content: `这是普通助手回复 ${i + 1}，用于混合场景性能测试。`,
      timestamp: ts,
    });
  }

  return { conversationId, messages };
}
