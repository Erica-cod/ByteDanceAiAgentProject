import { describe, expect, test } from '@jest/globals';
import { MultiAgentOrchestrator } from '../../api/workflows/multiAgentOrchestrator.js';

function output(agentId: string, round: number, metadata: any = {}) {
  return {
    agent_id: agentId,
    round,
    output_type: agentId === 'host' ? 'control' : 'analysis',
    content: `${agentId}-${round}`,
    metadata: {
      position: {
        conclusion: `${agentId}-${round}`,
        key_reasons: [],
        assumptions: [],
        confidence: 0.8,
      },
      ...metadata,
    },
    timestamp: new Date().toISOString(),
  };
}

function fakeAgent(
  id: string,
  calls: string[],
  generateMetadata?: (round: number) => any
) {
  return {
    callModel: async () => '',
    reset: () => undefined,
    generate: async (_query: string, _context: any, round: number) => {
      calls.push(`${id}:${round}`);
      return output(id, round, generateMetadata?.(round));
    },
  };
}

describe('multi-agent dynamic routing', () => {
  test('next_agents为critic时下一轮不能再次执行Planner', async () => {
    const calls: string[] = [];
    let hostRound = 0;
    const host = fakeAgent('host', calls);
    host.generate = async (_query: string, _context: any, round: number) => {
      calls.push(`host:${round}`);
      hostRound += 1;
      const decision =
        hostRound === 1
          ? {
              action: 'challenge',
              reason: '压力测试',
              next_agents: ['critic'],
            }
          : {
              action: 'finalize',
              reason: '验证完成',
              next_agents: ['reporter'],
            };
      return output('host', round, {
        decision,
        analysis: {
          consensus_level: 0.9,
          stubborn_agents: [],
          trend: [0.9],
          coverage: 1,
          unresolved_high_risks: [],
          high_risk_trend: [0],
          coverage_trend: [1],
          progress_delta: 1,
          stagnation_rounds: 0,
          validity_check: {
            feasible: true,
            realistic: true,
            complete: true,
          },
        },
      });
    };

    const orchestrator = new MultiAgentOrchestrator({
      maxRounds: 3,
      userId: 'user',
      conversationId: 'conversation',
      agentOverrides: {
        planner: fakeAgent('planner', calls) as any,
        critic: fakeAgent('critic', calls) as any,
        host: host as any,
        reporter: fakeAgent('reporter', calls) as any,
      },
    });

    const session = await orchestrator.run('测试动态路由');

    expect(calls.filter(call => call.startsWith('planner:'))).toEqual([
      'planner:1',
    ]);
    expect(calls.filter(call => call.startsWith('critic:'))).toEqual([
      'critic:1',
      'critic:2',
    ]);
    expect(calls.filter(call => call.startsWith('reporter:'))).toHaveLength(1);
    expect(session.status).toBe('converged');
  });

  test('revise约束应交给Planner，修订后再只调度Critic验证', async () => {
    const calls: string[] = [];
    const contexts: Array<{ agent: string; round: number; context: any }> = [];
    let hostRound = 0;
    const recordAgent = (id: string) => ({
      callModel: async () => '',
      reset: () => undefined,
      generate: async (_query: string, context: any, round: number) => {
        calls.push(`${id}:${round}`);
        contexts.push({ agent: id, round, context });
        return output(id, round);
      },
    });
    const host = fakeAgent('host', calls);
    host.generate = async (_query: string, _context: any, round: number) => {
      calls.push(`host:${round}`);
      hostRound += 1;
      const decisions = [
        {
          action: 'revise',
          reason: '修订缓存方案',
          next_agents: ['planner'],
          constraints: { must_address: ['缓存击穿'] },
        },
        {
          action: 'verify',
          reason: '验证修订',
          next_agents: ['critic'],
          constraints: { must_address: ['缓存击穿'] },
        },
        {
          action: 'finalize',
          reason: '验证完成',
          next_agents: ['reporter'],
        },
      ];
      return output('host', round, {
        decision: decisions[hostRound - 1],
        analysis: {
          consensus_level: 0.8,
          stubborn_agents: [],
          trend: [0.8],
          coverage: 1,
          unresolved_high_risks: [],
          high_risk_trend: [0],
          coverage_trend: [1],
          progress_delta: 1,
          stagnation_rounds: 0,
          validity_check: {
            feasible: true,
            realistic: true,
            complete: true,
          },
        },
      });
    };

    const orchestrator = new MultiAgentOrchestrator({
      maxRounds: 4,
      userId: 'user',
      conversationId: 'conversation',
      agentOverrides: {
        planner: recordAgent('planner') as any,
        critic: recordAgent('critic') as any,
        host: host as any,
        reporter: fakeAgent('reporter', calls) as any,
      },
    });

    await orchestrator.run('测试修订验证闭环');

    expect(calls.filter(call => call.startsWith('planner:'))).toEqual([
      'planner:1',
      'planner:2',
    ]);
    expect(calls.filter(call => call.startsWith('critic:'))).toEqual([
      'critic:1',
      'critic:3',
    ]);
    expect(
      contexts.find(item => item.agent === 'planner' && item.round === 2)
        ?.context.host_instructions
    ).toContain('缓存击穿');
    expect(
      contexts.find(item => item.agent === 'critic' && item.round === 3)
        ?.context.host_instructions
    ).toContain('缓存击穿');
  });
});
