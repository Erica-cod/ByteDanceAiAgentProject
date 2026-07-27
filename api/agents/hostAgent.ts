/**
 * Host Agent - 主持人
 * 
 * 职责：
 * - 流程控制和决策
 * - 检测共识/分歧
 * - 管理讨论轮次
 * - 决定下一步动作
 */

import { BaseAgent, type AgentOutput, type PositionSummary, type AgentConfig } from './baseAgent.js';
import { comparePositions, simpleComparePositions, compareSelfSimilarity, type SimilarityResult } from '../tools/plugins/similarityTools.js';

/**
 * Host 决策类型
 */
export type HostAction = 
  | 'revise'             // Planner 根据明确问题修订
  | 'challenge'          // Critic 执行压力测试
  | 'verify'             // Critic 验证修订结果
  | 'finalize'           // 进入 Reporter
  | 'terminate';         // 达到预算，带未解决风险结束

export interface HostPolicyConfig {
  minRounds: number;
  maxRounds: number;
  agreementThreshold: number;
  coverageThreshold: number;
  stagnationThreshold: number;
  maxStagnationRounds: number;
}

export const DEFAULT_HOST_POLICY: HostPolicyConfig = {
  minRounds: 2,
  maxRounds: 5,
  agreementThreshold: 0.9,
  coverageThreshold: 0.9,
  stagnationThreshold: 0.02,
  maxStagnationRounds: 2,
};

/**
 * Host 决策
 */
export interface HostDecision {
  action: HostAction;
  reason: string;
  next_agents: string[];  // 下一轮发言的Agent
  constraints?: {
    must_address?: string[];  // 必须解决的问题
    avoid?: string[];         // 避免的行为
  };
}

/**
 * 共识分析
 */
export interface ConsensusAnalysis {
  consensus_level: number;      // 共识水平 (0-1)
  similarity_matrix?: number[][];
  most_different_pair?: [number, number];
  stubborn_agents: string[];    // 顽固的Agent
  trend: number[];              // 共识趋势（历史相似度）
  coverage: number;             // Critic 三项有效性检查覆盖率
  unresolved_high_risks: string[];
  high_risk_trend: number[];
  coverage_trend: number[];
  progress_delta: number;
  stagnation_rounds: number;
  validity_check: {
    feasible: boolean;
    realistic: boolean;
    complete: boolean;
  };
}

/**
 * Host 输出元数据
 */
export interface HostMetadata {
  decision: HostDecision;
  analysis: ConsensusAnalysis;
}

/**
 * Host Agent
 */
export class HostAgent extends BaseAgent {
  // 共识趋势历史
  private consensusTrend: number[] = [];
  
  // Agent自相似度历史
  private selfSimilarityHistory: Map<string, number[]> = new Map();
  private readonly policy: HostPolicyConfig;

  constructor(
    config?: Partial<AgentConfig>,
    policy?: Partial<HostPolicyConfig>
  ) {
    super({
      agentId: 'host',
      temperature: 0.3,  // 低温度，保持决策的一致性
      maxTokens: 2000,
      ...config,
    });
    this.policy = { ...DEFAULT_HOST_POLICY, ...policy };
  }

  protected getDefaultSystemPrompt(): string {
    return `你是一位专业的主持人（Host），负责管理多Agent讨论流程并做出决策。

## 你的职责

1. **流程控制**：根据未解决风险和有效性检查决定修订、验证或结束
2. **共识检测**：相似度只用于检测重复或过快共识，不代表方案正确
3. **分歧管理**：当分歧过大时，引导讨论方向
4. **顽固检测**：发现不愿改变立场的Agent
5. **最终决策**：决定何时结束讨论并生成报告

## 决策规则

### 1. 存在未解决高风险
- 行动：revise，让Planner逐项回应具体风险

### 2. Planner完成修订
- 行动：verify，只让Critic验证修订是否真正解决问题

### 3. 首轮过快达成一致
- 行动：challenge，额外执行一次压力测试，防止互相迎合

### 4. 满足结构化终止条件
- feasible、realistic、complete 全部为真
- 没有未解决高风险
- 覆盖率达到阈值
- 行动：finalize

### 5. 达到最大轮次
- 行动：terminate，并把未解决风险交给Reporter披露

## 输出要求

你不需要输出JSON，只需要输出简洁的决策说明即可。
系统会根据你的分析自动生成决策数据。

你的输出应该包括：
1. 当前讨论状态分析
2. 共识水平评估
3. 下一步建议
4. 对各Agent的具体指示（如果需要）

保持客观、简洁、明确。`;
  }

  async generate(
    userQuery: string,
    context: any,
    round: number
  ): Promise<AgentOutput> {
    console.log(`\n🎯 [Host] 第 ${round} 轮决策开始...`);

    try {
      // 分析当前状态
      const analysis = await this.analyzeConsensus(context, round);
      
      // 做出决策
      const decision = this.makeDecision(analysis, round, context);

      // 生成说明文本
      const content = this.generateDecisionContent(decision, analysis);

      // 构建输出
      const output: AgentOutput = {
        agent_id: this.agentId,
        round,
        output_type: 'control',
        content,
        metadata: {
          decision,
          analysis,
        },
        timestamp: new Date().toISOString(),
      };

      console.log(`✅ [Host] 决策完成: ${decision.action}`);
      console.log(`📊 [Host] 共识水平: ${analysis.consensus_level.toFixed(3)}`);

      return output;
    } catch (error: any) {
      console.error(`❌ [Host] 决策失败:`, error);
      
      // 默认决策：继续
      return {
        agent_id: this.agentId,
        round,
        output_type: 'control',
        content: `决策分析失败，默认继续讨论。错误: ${error.message}`,
        metadata: {
          decision: {
            action: 'verify',
            reason: '决策失败，降级为Critic验证',
            next_agents: ['critic'],
          },
          analysis: {
            consensus_level: 0.5,
            stubborn_agents: [],
            trend: this.consensusTrend,
            coverage: 0,
            unresolved_high_risks: [],
            high_risk_trend: [],
            coverage_trend: [],
            progress_delta: 0,
            stagnation_rounds: 0,
            validity_check: {
              feasible: false,
              realistic: false,
              complete: false,
            },
          },
        },
        timestamp: new Date().toISOString(),
      };
    }
  }

  protected extractPosition(content: string, metadata: any): PositionSummary {
    // Host不需要position
    return {
      conclusion: '流程控制',
      key_reasons: [],
      assumptions: [],
      confidence: 1.0,
    };
  }

  /**
   * 分析共识水平
   */
  private async analyzeConsensus(context: any, round: number): Promise<ConsensusAnalysis> {
    console.log(`🔍 [Host] 分析共识水平...`);

    const positions: string[] = [];
    const agentIds: string[] = [];

    // 收集所有Agent的立场
    if (context.planner_output && context.planner_output.metadata.position) {
      const pos = context.planner_output.metadata.position;
      positions.push(this.positionToText(pos));
      agentIds.push('planner');
    }

    if (context.critic_output && context.critic_output.metadata.position) {
      const pos = context.critic_output.metadata.position;
      positions.push(this.positionToText(pos));
      agentIds.push('critic');
    }

    let consensus_level = 0.5;  // 默认中等共识
    let similarity_matrix: number[][] | undefined;
    let most_different_pair: [number, number] | undefined;

    // 如果有足够的立场，计算相似度
    if (positions.length >= 2) {
      try {
        // 尝试使用embedding计算
        const result = await comparePositions(positions);
        consensus_level = result.mean_similarity;
        similarity_matrix = result.similarity_matrix;
        most_different_pair = result.most_different_pair;
        
        console.log(`✅ [Host] 使用embedding计算相似度: ${consensus_level.toFixed(3)}`);
      } catch (error) {
        console.warn(`⚠️ [Host] Embedding计算失败，使用简单方法:`, error);
        
        // Fallback: 使用简单文本相似度
        const simpleResult = simpleComparePositions(positions);
        consensus_level = simpleResult.mean_similarity;
        similarity_matrix = simpleResult.similarity_matrix;
        most_different_pair = simpleResult.most_different_pair;
      }
    }

    // 从会话状态恢复趋势，保证断点续传后不会从空数组重新开始。
    const previousState = context.host_state ?? {};
    const previousConsensusTrend: number[] =
      previousState.consensus_trend ?? this.consensusTrend;
    this.consensusTrend = [...previousConsensusTrend, consensus_level];

    // 检测顽固Agent
    const stubborn_agents = await this.detectStubbornAgents(context, round);

    const critique = context.critic_output?.metadata?.critique;
    const validity_check = {
      feasible: Boolean(critique?.validity_check?.feasible),
      realistic: Boolean(critique?.validity_check?.realistic),
      complete: Boolean(critique?.validity_check?.complete),
    };
    const coverage =
      Object.values(validity_check).filter(Boolean).length /
      Object.keys(validity_check).length;
    const unresolved_high_risks: string[] = (critique?.risks ?? [])
      .filter((risk: any) => risk.severity === 'high')
      .map((risk: any) => risk.risk);
    const previousHighRiskTrend: number[] =
      previousState.high_risk_trend ?? [];
    const previousCoverageTrend: number[] =
      previousState.coverage_trend ?? [];
    const previousRiskCount =
      previousHighRiskTrend[previousHighRiskTrend.length - 1];
    const previousCoverage =
      previousCoverageTrend[previousCoverageTrend.length - 1];
    const riskProgress =
      previousRiskCount === undefined
        ? 0
        : (previousRiskCount - unresolved_high_risks.length) /
          Math.max(previousRiskCount, 1);
    const coverageProgress =
      previousCoverage === undefined ? 0 : coverage - previousCoverage;
    const progress_delta =
      previousRiskCount === undefined && previousCoverage === undefined
        ? 1
        : (riskProgress + coverageProgress) / 2;
    const previousStagnationRounds = previousState.stagnation_rounds ?? 0;
    const stagnation_rounds =
      Math.abs(progress_delta) < this.policy.stagnationThreshold
        ? previousStagnationRounds + 1
        : 0;

    return {
      consensus_level,
      similarity_matrix,
      most_different_pair,
      stubborn_agents,
      trend: [...this.consensusTrend],
      coverage,
      unresolved_high_risks,
      high_risk_trend: [
        ...previousHighRiskTrend,
        unresolved_high_risks.length,
      ],
      coverage_trend: [...previousCoverageTrend, coverage],
      progress_delta,
      stagnation_rounds,
      validity_check,
    };
  }

  /**
   * 检测顽固Agent（自相似度过高）
   */
  private async detectStubbornAgents(context: any, round: number): Promise<string[]> {
    if (round < 2) {
      return [];  // 第一轮无法检测
    }

    const stubborn: string[] = [];

    // 检查Planner
    if (context.planner_output && context.planner_previous_output) {
      const currentPos = context.planner_output.metadata.position;
      const previousPos = context.planner_previous_output.metadata.position;
      
      const currentText = this.positionToText(currentPos);
      const previousText = this.positionToText(previousPos);
      
      try {
        const selfSim = await compareSelfSimilarity(currentText, previousText);
        
        // 记录历史
        if (!this.selfSimilarityHistory.has('planner')) {
          this.selfSimilarityHistory.set('planner', []);
        }
        this.selfSimilarityHistory.get('planner')!.push(selfSim);
        
        // 如果连续2轮都 > 0.98，认为顽固
        const history = this.selfSimilarityHistory.get('planner')!;
        if (history.length >= 2) {
          const last2 = history.slice(-2);
          if (last2.every(s => s > 0.98)) {
            stubborn.push('planner');
            console.warn(`⚠️ [Host] 检测到顽固Agent: planner (自相似度: ${selfSim.toFixed(3)})`);
          }
        }
      } catch (error) {
        console.warn(`⚠️ [Host] 无法计算Planner自相似度:`, error);
      }
    }

    // 检查Critic（类似逻辑）
    if (context.critic_output && context.critic_previous_output) {
      const currentPos = context.critic_output.metadata.position;
      const previousPos = context.critic_previous_output.metadata.position;
      
      const currentText = this.positionToText(currentPos);
      const previousText = this.positionToText(previousPos);
      
      try {
        const selfSim = await compareSelfSimilarity(currentText, previousText);
        
        if (!this.selfSimilarityHistory.has('critic')) {
          this.selfSimilarityHistory.set('critic', []);
        }
        this.selfSimilarityHistory.get('critic')!.push(selfSim);
        
        const history = this.selfSimilarityHistory.get('critic')!;
        if (history.length >= 2) {
          const last2 = history.slice(-2);
          if (last2.every(s => s > 0.98)) {
            stubborn.push('critic');
            console.warn(`⚠️ [Host] 检测到顽固Agent: critic (自相似度: ${selfSim.toFixed(3)})`);
          }
        }
      } catch (error) {
        console.warn(`⚠️ [Host] 无法计算Critic自相似度:`, error);
      }
    }

    return stubborn;
  }

  /**
   * 做出决策
   */
  private makeDecision(
    analysis: ConsensusAnalysis,
    round: number,
    context: any
  ): HostDecision {
    const {
      consensus_level,
      unresolved_high_risks,
      coverage,
      validity_check,
      stagnation_rounds,
    } = analysis;
    const maxRounds = context.max_rounds || this.policy.maxRounds;
    const executedAgents: string[] = context.executed_agents ?? [];

    console.log(`🤔 [Host] 决策依据: 共识=${consensus_level.toFixed(3)}, 轮次=${round}/${maxRounds}`);

    // 1. 达到最大轮次 -> 带未解决风险终止
    if (round >= maxRounds) {
      return {
        action: 'terminate',
        reason:
          unresolved_high_risks.length > 0
            ? `已达到最大轮次 (${maxRounds})，保留 ${unresolved_high_risks.length} 个未解决高风险`
            : `已达到最大轮次 (${maxRounds})，终止讨论`,
        next_agents: ['reporter'],
        constraints: {
          must_address: unresolved_high_risks,
          avoid: ['隐藏尚未解决的风险'],
        },
      };
    }

    // 2. 本轮只有Planner修订，必须交给Critic验证，不能直接结束。
    if (
      executedAgents.includes('planner') &&
      !executedAgents.includes('critic')
    ) {
      return {
        action: 'verify',
        reason: 'Planner已完成修订，需要Critic验证风险是否真正关闭',
        next_agents: ['critic'],
        constraints: {
          must_address: this.extractKeyIssues(context),
          avoid: ['只复述旧风险，不评价修订结果'],
        },
      };
    }

    // 3. 先判断有没有真实进展；重复并不等于收敛。
    if (
      stagnation_rounds >= this.policy.maxStagnationRounds &&
      unresolved_high_risks.length > 0
    ) {
      return {
        action: 'revise',
        reason: `连续 ${stagnation_rounds} 轮没有实质进展，要求Planner更换方案或关键假设`,
        next_agents: ['planner'],
        constraints: {
          must_address: unresolved_high_risks,
          avoid: ['重复原方案', '只调整措辞不调整设计'],
        },
      };
    }

    // 4. 高风险优先交给Planner逐项修订，而不是继续扩大分歧。
    if (unresolved_high_risks.length > 0) {
      return {
        action: 'revise',
        reason: `仍有 ${unresolved_high_risks.length} 个高风险需要关闭`,
        next_agents: ['planner'],
        constraints: {
          must_address: unresolved_high_risks,
          avoid: ['泛化回应', '忽略最坏情况'],
        },
      };
    }

    const structurallyReady =
      validity_check.feasible &&
      validity_check.realistic &&
      validity_check.complete &&
      coverage >= this.policy.coverageThreshold;

    // 5. 只有结构检查已通过但首轮过快一致时，才增加压力测试。
    if (
      round < this.policy.minRounds &&
      consensus_level >= this.policy.agreementThreshold &&
      structurallyReady
    ) {
      return {
        action: 'challenge',
        reason: `首轮共识过高 (${consensus_level.toFixed(2)})，增加一次反方压力测试`,
        next_agents: ['critic'],
        constraints: {
          must_address: ['剩余不确定性', '最坏情况分析', '关键假设失效场景'],
          avoid: ['为了达成一致而省略风险'],
        },
      };
    }

    const readyToFinalize =
      round >= this.policy.minRounds &&
      structurallyReady;
    if (readyToFinalize) {
      return {
        action: 'finalize',
        reason: `可行性、现实性和完整性均已通过，覆盖率 ${(coverage * 100).toFixed(0)}%`,
        next_agents: ['reporter'],
      };
    }

    // 6. 没有高风险但结构检查未通过，先修订再验证。
    if (
      !validity_check.feasible ||
      !validity_check.realistic ||
      !validity_check.complete
    ) {
      return {
        action: 'revise',
        reason: '结构化有效性检查尚未全部通过',
        next_agents: ['planner'],
        constraints: {
          must_address: this.extractKeyIssues(context),
          avoid: ['只追求语义一致'],
        },
      };
    }

    // 7. 默认由Critic做最后验证。
    return {
      action: 'verify',
      reason: '尚未满足结束条件，继续验证剩余不确定性',
      next_agents: ['critic'],
      constraints: {
        must_address: this.extractKeyIssues(context),
        avoid: ['重复之前的论点'],
      },
    };
  }

  /**
   * 提取关键问题（从Critic的建议中）
   */
  private extractKeyIssues(context: any): string[] {
    const issues: string[] = [];

    if (context.critic_output && context.critic_output.metadata.critique) {
      const critique = context.critic_output.metadata.critique;
      
      // 提取高优先级建议
      if (critique.suggestions) {
        critique.suggestions
          .filter((s: any) => s.priority === 'high')
          .forEach((s: any) => {
            issues.push(s.issue);
          });
      }

      // 提取高风险
      if (critique.risks) {
        critique.risks
          .filter((r: any) => r.severity === 'high')
          .forEach((r: any) => {
            issues.push(r.risk);
          });
      }
    }

    return issues.slice(0, 3);  // 最多3个关键问题
  }

  /**
   * 生成决策说明内容
   */
  private generateDecisionContent(decision: HostDecision, analysis: ConsensusAnalysis): string {
    let content = `# 主持人决策\n\n`;
    
    content += `**决策**: ${this.getActionName(decision.action)}\n\n`;
    content += `**理由**: ${decision.reason}\n\n`;
    
    content += `## 共识分析\n\n`;
    content += `- **共识水平**: ${(analysis.consensus_level * 100).toFixed(1)}%\n`;
    content += `- **趋势**: ${this.formatTrend(analysis.trend)}\n`;
    content += `- **结构覆盖率**: ${(analysis.coverage * 100).toFixed(0)}%\n`;
    content += `- **未解决高风险**: ${analysis.unresolved_high_risks.length}\n`;
    content += `- **停滞轮数**: ${analysis.stagnation_rounds}\n`;
    
    if (analysis.stubborn_agents.length > 0) {
      content += `- **顽固Agent**: ${analysis.stubborn_agents.join(', ')}\n`;
    }
    
    content += `\n## 下一步行动\n\n`;
    content += `**发言Agent**: ${decision.next_agents.join(', ')}\n\n`;
    
    if (decision.constraints) {
      if (decision.constraints.must_address && decision.constraints.must_address.length > 0) {
        content += `**必须解决的问题**:\n`;
        decision.constraints.must_address.forEach(issue => {
          content += `- ${issue}\n`;
        });
        content += `\n`;
      }
      
      if (decision.constraints.avoid && decision.constraints.avoid.length > 0) {
        content += `**避免的行为**:\n`;
        decision.constraints.avoid.forEach(avoid => {
          content += `- ${avoid}\n`;
        });
      }
    }
    
    return content;
  }

  /**
   * 获取决策名称（中文）
   */
  private getActionName(action: HostAction): string {
    const names: Record<HostAction, string> = {
      revise: '修订方案',
      challenge: '反方压力测试',
      verify: '验证修订',
      finalize: '生成最终报告',
      terminate: '终止讨论',
    };
    return names[action];
  }

  /**
   * 格式化趋势
   */
  private formatTrend(trend: number[]): string {
    if (trend.length < 2) {
      return '数据不足';
    }
    
    const last = trend[trend.length - 1];
    const previous = trend[trend.length - 2];
    const delta = last - previous;
    
    if (delta > 0.05) {
      return `上升 ↗ (+${(delta * 100).toFixed(1)}%)`;
    } else if (delta < -0.05) {
      return `下降 ↘ (${(delta * 100).toFixed(1)}%)`;
    } else {
      return `稳定 → (${(delta * 100).toFixed(1)}%)`;
    }
  }

  /**
   * 重置Host状态
   */
  reset(): void {
    super.reset();
    this.consensusTrend = [];
    this.selfSimilarityHistory.clear();
  }
}

