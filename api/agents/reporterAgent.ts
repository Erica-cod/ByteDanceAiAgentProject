/**
 * Reporter Agent - 报告员
 * 
 * 职责：
 * - 将最终结构化计划转换为用户可读文本
 * - 总结讨论过程和关键决策
 * - 生成最终报告
 */

import { BaseAgent, type AgentOutput, type PositionSummary, type AgentConfig } from './baseAgent.js';

/**
 * 讨论总结
 */
export interface DiscussionSummary {
  key_agreements: string[];        // 关键共识
  resolved_concerns: string[];     // 已解决的问题
  remaining_uncertainties: string[]; // 剩余不确定性
}

/**
 * 最终报告
 */
export interface FinalReport {
  title: string;
  goal: string;
  consensus_level: 'high' | 'medium' | 'low';
  participating_agents: string[];
  rounds: number;
  plan: any;  // 最终计划
  summary: DiscussionSummary;
}

/**
 * Reporter 输出元数据
 */
export interface ReporterMetadata {
  final_plan: FinalReport;
}

/**
 * Reporter Agent
 */
export class ReporterAgent extends BaseAgent {
  constructor(config?: Partial<AgentConfig>) {
    super({
      agentId: 'reporter',
      temperature: 0.5,  // 较低温度，保持客观
      maxTokens: 4000,   // 更多token用于生成详细报告
      ...config,
    });
  }

  protected getDefaultSystemPrompt(): string {
    return `你是一位专业的报告员（Reporter），擅长总结讨论过程并生成清晰的最终报告。

## 你的职责

1. **总结讨论**：概括Planner和Critic之间的讨论要点
2. **提炼共识**：找出各方达成一致的关键点
3. **记录分歧**：如果有未解决的分歧，客观记录
4. **生成报告**：将最终计划转换为用户友好的格式
5. **行动指南**：提供清晰的下一步行动建议

## 输出要求

你必须输出一份完整的Markdown格式报告，包含以下部分：

1. **标题和目标**
2. **讨论总结**
   - 参与的Agent和轮次
   - 关键共识点
   - 已解决的问题
   - 剩余的不确定性
3. **最终计划**
   - 完整的计划内容（基于Planner的最终版本）
   - 已整合Critic的建议
4. **执行建议**
   - 优先级排序
   - 风险应对
   - 里程碑检查点
5. **总结**

## 报告原则

1. **客观中立**：不偏向任何一方，客观呈现事实
2. **清晰易懂**：使用简洁的语言，避免术语
3. **结构化**：使用标题、列表、表格等提高可读性
4. **可执行**：确保用户看完报告后知道该做什么
5. **完整性**：不遗漏重要信息

## 格式要求

- 使用Markdown格式
- 使用emoji增强可读性（适度使用）
- 重要信息使用**粗体**强调
- 使用有序列表和无序列表组织信息
- 如果有表格数据，使用Markdown表格

现在，请根据所有Agent的输出，生成一份完整的最终报告。`;
  }

  async generate(
    userQuery: string,
    context: any,
    round: number
  ): Promise<AgentOutput> {
    console.log(`\n📝 [Reporter] 生成最终报告...`);

    try {
      // 构建上下文消息
      const contextMessages: string[] = [];

      // 添加用户原始查询
      contextMessages.push(
        `用户的原始需求：\n${userQuery}\n`
      );

      // 添加所有历史讨论
      if (context.discussion_history && context.discussion_history.length > 0) {
        contextMessages.push(
          `讨论历史（共 ${context.discussion_history.length} 轮）：\n` +
          JSON.stringify(context.discussion_history, null, 2)
        );
      }

      // 添加Planner的最终计划
      if (context.final_planner_output) {
        contextMessages.push(
          `Planner的最终计划：\n${JSON.stringify(context.final_planner_output.metadata, null, 2)}`
        );
      }

      // 添加Critic的最终反馈
      if (context.final_critic_output) {
        contextMessages.push(
          `Critic的最终反馈：\n${JSON.stringify(context.final_critic_output.metadata, null, 2)}`
        );
      }

      // 添加共识信息
      if (context.consensus_info) {
        contextMessages.push(
          `共识分析：\n` +
          `- 平均相似度: ${context.consensus_info.mean_similarity?.toFixed(2) || 'N/A'}\n` +
          `- 共识水平: ${context.consensus_info.level || 'medium'}\n`
        );
      }

      // 构建消息并调用模型
      const messages = this.buildMessages(
        '请生成一份完整的最终报告，总结讨论过程并呈现最终计划。',
        contextMessages
      );
      const response = await this.callModel(messages);

      // 提取最终计划数据（用于保存到数据库）
      const finalPlan = this.extractFinalPlan(context);

      // 构建输出
      const output: AgentOutput = {
        agent_id: this.agentId,
        round,
        output_type: 'report',
        content: response,  // Reporter直接输出Markdown文本
        metadata: {
          final_plan: finalPlan,
        },
        timestamp: new Date().toISOString(),
      };

      console.log(`✅ [Reporter] 最终报告生成完成`);

      return output;
    } catch (error: any) {
      console.error(`❌ [Reporter] 生成失败:`, error);
      
      return {
        agent_id: this.agentId,
        round,
        output_type: 'error',
        content: `报告生成失败: ${error.message}`,
        metadata: { error: error.message },
        timestamp: new Date().toISOString(),
      };
    }
  }

  protected extractPosition(content: string, metadata: any): PositionSummary {
    // Reporter不需要position，因为它是最终总结
    return {
      conclusion: '生成最终报告',
      key_reasons: ['总结讨论', '呈现计划'],
      assumptions: [],
      confidence: 1.0,
    };
  }

  /**
   * 从上下文中提取最终计划数据
   */
  private extractFinalPlan(context: any): FinalReport {
    const plannerOutput = context.final_planner_output;
    const criticOutput = context.final_critic_output;
    const consensusInfo = context.consensus_info;
    const discussionHistory = context.discussion_history || [];

    // 提取关键共识
    const key_agreements: string[] = [];
    if (plannerOutput && plannerOutput.metadata.position) {
      key_agreements.push(...plannerOutput.metadata.position.key_reasons);
    }

    // 提取已解决的问题
    const resolved_concerns: string[] = [];
    if (criticOutput && criticOutput.metadata.critique) {
      criticOutput.metadata.critique.suggestions.forEach((s: any) => {
        if (s.priority === 'high') {
          resolved_concerns.push(`${s.issue} -> ${s.solution}`);
        }
      });
    }

    // 提取剩余不确定性
    const remaining_uncertainties: string[] = [];
    if (criticOutput && criticOutput.metadata.critique) {
      criticOutput.metadata.critique.risks.forEach((r: any) => {
        if (r.severity === 'high' || r.severity === 'medium') {
          remaining_uncertainties.push(r.risk);
        }
      });
    }

    // 确定共识水平
    let consensus_level: 'high' | 'medium' | 'low' = 'medium';
    if (consensusInfo && consensusInfo.mean_similarity !== undefined) {
      if (consensusInfo.mean_similarity > 0.85) {
        consensus_level = 'high';
      } else if (consensusInfo.mean_similarity < 0.70) {
        consensus_level = 'low';
      }
    }

    // 参与的Agent
    const participating_agents: string[] = Array.from(
      new Set(discussionHistory.map((h: any) => h.agent_id))
    );

    return {
      title: plannerOutput?.metadata.plan.title || '计划',
      goal: plannerOutput?.metadata.plan.goal || '',
      consensus_level,
      participating_agents,
      rounds: discussionHistory.length,
      plan: plannerOutput?.metadata.plan || {},
      summary: {
        key_agreements,
        resolved_concerns,
        remaining_uncertainties,
      },
    };
  }
}

