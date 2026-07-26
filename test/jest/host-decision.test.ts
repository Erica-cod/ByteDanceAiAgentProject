import { describe, expect, test } from '@jest/globals';
import {
  HostAgent,
  type ConsensusAnalysis,
} from '../../api/agents/hostAgent.js';

function analysis(
  overrides: Partial<ConsensusAnalysis> = {}
): ConsensusAnalysis {
  return {
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
    ...overrides,
  };
}

function decide(
  host: HostAgent,
  currentAnalysis: ConsensusAnalysis,
  round: number,
  context: Record<string, unknown> = {}
) {
  return (host as any).makeDecision(currentAnalysis, round, {
    max_rounds: 5,
    executed_agents: ['planner', 'critic'],
    ...context,
  });
}

describe('Host structured decisions', () => {
  test('高相似度但存在高风险时不能直接结束', () => {
    const decision = decide(
      new HostAgent(),
      analysis({
        consensus_level: 0.96,
        unresolved_high_risks: ['缓存击穿'],
        high_risk_trend: [1],
      }),
      2
    );

    expect(decision.action).toBe('revise');
    expect(decision.next_agents).toEqual(['planner']);
  });

  test('首轮高共识应先压力测试', () => {
    const decision = decide(
      new HostAgent(),
      analysis({ consensus_level: 0.96 }),
      1
    );
    expect(decision.action).toBe('challenge');
    expect(decision.next_agents).toEqual(['critic']);
  });

  test('首轮高共识但结构检查未通过时应先修订', () => {
    const decision = decide(
      new HostAgent(),
      analysis({
        consensus_level: 0.96,
        coverage: 2 / 3,
        validity_check: {
          feasible: true,
          realistic: true,
          complete: false,
        },
      }),
      1
    );
    expect(decision.action).toBe('revise');
    expect(decision.next_agents).toEqual(['planner']);
  });

  test('结构检查通过且无高风险时才finalize', () => {
    const decision = decide(new HostAgent(), analysis(), 2);
    expect(decision.action).toBe('finalize');
    expect(decision.next_agents).toEqual(['reporter']);
  });

  test('Planner单独修订后必须由Critic验证', () => {
    const decision = decide(new HostAgent(), analysis(), 2, {
      executed_agents: ['planner'],
    });
    expect(decision.action).toBe('verify');
    expect(decision.next_agents).toEqual(['critic']);
  });

  test('最大轮次必须披露未解决风险', () => {
    const decision = decide(
      new HostAgent(),
      analysis({
        unresolved_high_risks: ['数据不一致'],
        high_risk_trend: [1],
      }),
      5
    );
    expect(decision.action).toBe('terminate');
    expect(decision.constraints?.must_address).toContain('数据不一致');
  });
});
