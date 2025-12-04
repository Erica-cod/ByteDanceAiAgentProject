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
import { comparePositions, simpleComparePositions, compareSelfSimilarity, type SimilarityResult } from '../tools/similarityTools.js';

/**
 * Host 决策类型
 */
export type HostAction = 
  | 'continue'           // 继续讨论
  | 'converge'           // 进入收敛阶段
  | 'force_opposition'   // 强制反方角色
  | 'terminate';         // 终止讨论

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

  constructor(config?: Partial<AgentConfig>) {
    super({
      agentId: 'host',
      temperature: 0.3,  // 低温度，保持决策的一致性
      maxTokens: 2000,
      ...config,
    });
  }

  protected getDefaultSystemPrompt(): string {
    return `你是一位专业的主持人（Host），负责管理多Agent讨论流程并做出决策。

## 你的职责

1. **流程控制**：决定讨论是否继续、收敛或终止
2. **共识检测**：分析各Agent的立场相似度
3. **分歧管理**：当分歧过大时，引导讨论方向
4. **顽固检测**：发现不愿改变立场的Agent
5. **最终决策**：决定何时结束讨论并生成报告

## 决策规则

### 1. 高共识（相似度 > 0.90）
- 行动：进入收敛阶段 (converge)
- 要求所有Agent列出剩余不确定性和最坏情况
- 准备调用Reporter生成最终报告

### 2. 中度共识（0.70 < 相似度 <= 0.90）
- 行动：继续讨论 (continue)
- 指定需要重点讨论的问题
- 给出明确的改进方向

### 3. 低共识（相似度 <= 0.70）
- 行动：强制反方角色 (force_opposition)
- 指定一个Agent扮演"魔鬼代言人"
- 要求从反方角度论证

### 4. 顽固Agent检测
如果某个Agent连续2轮自相似度 > 0.98：
- 发出更新命令
- 要求修改假设或降低置信度

### 5. 达到最大轮次
- 行动：终止讨论 (terminate)
- 即使未完全达成共识，也要生成报告

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
            action: 'continue',
            reason: '决策失败，默认继续',
            next_agents: ['planner', 'critic'],
          },
          analysis: {
            consensus_level: 0.5,
            stubborn_agents: [],
            trend: this.consensusTrend,
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

    // 记录共识趋势
    this.consensusTrend.push(consensus_level);

    // 检测顽固Agent
    const stubborn_agents = await this.detectStubbornAgents(context, round);

    return {
      consensus_level,
      similarity_matrix,
      most_different_pair,
      stubborn_agents,
      trend: [...this.consensusTrend],
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
    const { consensus_level, stubborn_agents } = analysis;
    const maxRounds = context.max_rounds || 5;

    console.log(`🤔 [Host] 决策依据: 共识=${consensus_level.toFixed(3)}, 轮次=${round}/${maxRounds}`);

    // 1. 达到最大轮次 -> 终止
    if (round >= maxRounds) {
      return {
        action: 'terminate',
        reason: `已达到最大轮次 (${maxRounds})，终止讨论`,
        next_agents: ['reporter'],
      };
    }

    // 2. 高共识 (> 0.90) -> 收敛
    if (consensus_level > 0.90) {
      return {
        action: 'converge',
        reason: `共识水平高 (${consensus_level.toFixed(2)})，进入收敛阶段`,
        next_agents: ['planner', 'critic', 'reporter'],
        constraints: {
          must_address: ['剩余不确定性', '最坏情况分析'],
          avoid: ['重复之前的论点'],
        },
      };
    }

    // 3. 低共识 (<= 0.70) -> 强制反方
    if (consensus_level <= 0.70 && round >= 2) {
      return {
        action: 'force_opposition',
        reason: `共识水平低 (${consensus_level.toFixed(2)})，需要更多反方论证`,
        next_agents: ['critic'],
        constraints: {
          must_address: ['反方论证', '失败可能性'],
          avoid: ['重复之前的观点'],
        },
      };
    }

    // 4. 检测到顽固Agent -> 发出更新命令
    if (stubborn_agents.length > 0) {
      return {
        action: 'continue',
        reason: `检测到顽固Agent (${stubborn_agents.join(', ')})，要求更新立场`,
        next_agents: stubborn_agents,
        constraints: {
          must_address: ['修改关键假设', '降低置信度', '指出对方逻辑漏洞'],
          avoid: ['完全重复上一轮观点'],
        },
      };
    }

    // 5. 中度共识 (0.70 ~ 0.90) -> 继续讨论
    return {
      action: 'continue',
      reason: `共识水平中等 (${consensus_level.toFixed(2)})，继续讨论`,
      next_agents: ['planner', 'critic'],
      constraints: {
        must_address: this.extractKeyIssues(context),
        avoid: ['模糊的论述', '缺乏数据支持的假设'],
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
      continue: '继续讨论',
      converge: '进入收敛阶段',
      force_opposition: '强制反方角色',
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

