/**
 * Critic Agent - 批评家
 * 
 * 职责：
 * - 挑刺、可行性检查
 * - 提出修正建议
 * - 风险评估、假设检验
 */

import { BaseAgent, type AgentOutput, type PositionSummary, type AgentConfig } from './baseAgent.js';

/**
 * 风险评估
 */
export interface Risk {
  risk: string;              // 风险描述
  severity: 'low' | 'medium' | 'high';  // 严重程度
  impact: string;            // 影响描述
}

/**
 * 改进建议
 */
export interface Suggestion {
  issue: string;             // 问题描述
  solution: string;          // 解决方案
  priority: 'low' | 'medium' | 'high';  // 优先级
}

/**
 * 可行性检查
 */
export interface ValidityCheck {
  feasible: boolean;         // 是否可行
  realistic: boolean;        // 是否现实
  complete: boolean;         // 是否完整
}

/**
 * 批评结构
 */
export interface Critique {
  target_agent: string;      // 批评的目标Agent
  target_round: number;      // 目标轮次
  risks: Risk[];             // 风险列表
  suggestions: Suggestion[]; // 建议列表
  validity_check: ValidityCheck;  // 可行性检查
}

/**
 * Critic 输出元数据
 */
export interface CriticMetadata {
  position: PositionSummary;
  critique: Critique;
}

/**
 * Critic Agent
 */
export class CriticAgent extends BaseAgent {
  constructor(config?: Partial<AgentConfig>) {
    super({
      agentId: 'critic',
      temperature: 0.8,  // 稍高的温度，鼓励批判性思维
      maxTokens: 3000,
      ...config,
    });
  }

  protected getDefaultSystemPrompt(): string {
    return `你是一位严谨的批评家（Critic），擅长发现计划中的问题并提出建设性的改进建议。

## 你的职责

1. **批判性分析**：仔细审查Planner提出的计划，找出潜在问题
2. **风险评估**：识别计划执行中可能遇到的风险
3. **假设检验**：质疑计划中的假设是否合理
4. **可行性检查**：评估计划是否可行、现实、完整
5. **建设性建议**：提出具体的、可操作的改进方案

## 输出要求

你必须输出以下JSON结构（使用 \`\`\`json 代码块包裹）：

\`\`\`json
{
  "position": {
    "conclusion": "一句话总结你的评价",
    "key_reasons": ["问题1", "问题2", "问题3"],
    "assumptions": ["你的假设1", "你的假设2"],
    "confidence": 0.78
  },
  "critique": {
    "target_agent": "planner",
    "target_round": 1,
    "risks": [
      {
        "risk": "风险描述",
        "severity": "high",
        "impact": "可能的影响"
      }
    ],
    "suggestions": [
      {
        "issue": "问题描述",
        "solution": "具体的解决方案",
        "priority": "high"
      }
    ],
    "validity_check": {
      "feasible": true,
      "realistic": true,
      "complete": false
    }
  }
}
\`\`\`

## 批评原则

1. **建设性批评**：不仅指出问题，还要提供解决方案
2. **具体明确**：避免模糊的批评，要指出具体的问题点
3. **优先级排序**：区分高、中、低优先级的问题
4. **风险导向**：重点关注可能导致失败的风险
5. **平衡视角**：既要批评，也要认可合理的部分

## 批评维度

- **时间估算**：是否过于乐观或保守？
- **资源需求**：是否考虑了所有必要资源？
- **依赖关系**：任务之间的依赖是否合理？
- **风险应对**：是否有应急预案？
- **可衡量性**：目标是否可以量化评估？
- **假设合理性**：基础假设是否站得住脚？

## 注意事项

- 不要为了批评而批评，要基于事实和逻辑
- 如果计划很好，也要诚实地认可
- 提供的建议要具体、可执行
- 风险评估要客观，不要夸大或低估

现在，请根据Planner的计划和上下文信息，提供你的批评和建议。`;
  }

  async generate(
    userQuery: string,
    context: any,
    round: number
  ): Promise<AgentOutput> {
    console.log(`\n🔍 [Critic] 第 ${round} 轮批评开始...`);

    try {
      // 构建上下文消息
      const contextMessages: string[] = [];

      // 必须有Planner的输出才能批评
      if (!context.planner_output) {
        throw new Error('缺少Planner的输出，无法进行批评');
      }

      // 添加Planner的计划
      contextMessages.push(
        `以下是Planner提出的计划：\n\n${JSON.stringify(context.planner_output.metadata, null, 2)}\n\n` +
        `请仔细分析这个计划，找出潜在问题并提出改进建议。`
      );

      // 如果有Host的指示
      if (context.host_instructions) {
        contextMessages.push(
          `Host的指示：\n${context.host_instructions}`
        );
      }

      // 如果是后续轮次，提醒要有新的见解
      if (round > 1 && this.lastPosition) {
        contextMessages.push(
          `这是第 ${round} 轮批评。你上一轮的结论是："${this.lastPosition.conclusion}"。\n` +
          `Planner已经根据你的建议做了调整，请评估新的计划，提出新的见解。`
        );
      }

      // 如果Host要求强制反方角色
      if (context.force_opposition) {
        contextMessages.push(
          `⚠️ 特殊要求：请扮演"魔鬼代言人"(Devil's Advocate)角色。\n` +
          `从反方角度论证：如果这个计划失败，最可能的原因是什么？\n` +
          `不要引用你之前的观点，只从反对的角度提出新的质疑。`
        );
      }

      // 构建消息并调用模型
      const messages = this.buildMessages(userQuery, contextMessages);
      const response = await this.callModel(messages);

      // 提取JSON
      const jsonData = this.extractJSON(response);
      
      // 如果JSON解析失败或不完整，使用fallback机制
      if (!jsonData) {
        console.warn(`⚠️  [Critic] JSON提取完全失败，使用fallback提取策略`);
        console.warn(`   完整响应内容:\n${response.substring(0, 1000)}`);
        return this.createFallbackOutput(response, round, context);
      }
      
      if (!jsonData.position || !jsonData.critique) {
        console.warn(`⚠️  [Critic] JSON结构不完整`);
        console.warn(`   - position存在: ${!!jsonData.position}`);
        console.warn(`   - critique存在: ${!!jsonData.critique}`);
        console.warn(`   - JSON keys: ${Object.keys(jsonData).join(', ')}`);
        return this.createFallbackOutput(response, round, context);
      }

      // 构建输出
      const output: AgentOutput = {
        agent_id: this.agentId,
        round,
        output_type: 'critique',
        content: this.formatCritiqueContent(jsonData.critique, jsonData.position),
        metadata: {
          position: jsonData.position,
          critique: jsonData.critique,
        },
        timestamp: new Date().toISOString(),
      };

      // 保存到历史
      this.saveToHistory(output);

      console.log(`✅ [Critic] 第 ${round} 轮批评完成`);
      console.log(`📊 [Critic] 发现 ${jsonData.critique.risks.length} 个风险, ${jsonData.critique.suggestions.length} 条建议`);

      return output;
    } catch (error: any) {
      console.error(`❌ [Critic] 生成失败:`, error);
      
      return {
        agent_id: this.agentId,
        round,
        output_type: 'error',
        content: `批评生成失败: ${error.message}`,
        metadata: { error: error.message },
        timestamp: new Date().toISOString(),
      };
    }
  }

  protected extractPosition(content: string, metadata: any): PositionSummary {
    if (metadata && metadata.position) {
      return metadata.position;
    }

    return {
      conclusion: '计划需要改进',
      key_reasons: ['存在风险', '假设不足'],
      assumptions: ['计划可以优化'],
      confidence: 0.7,
    };
  }

  /**
   * 创建fallback输出（当JSON解析失败时）
   */
  private createFallbackOutput(response: string, round: number, context: any): AgentOutput {
    console.log(`🔧 [Critic] 使用fallback机制提取信息...`);
    
    // 从原始文本中提取关键信息
    const lines = response.split('\n').map(l => l.trim()).filter(l => l);
    
    // 尝试提取批评的结论
    let conclusion = '当前计划存在一些问题需要改进';
    for (const line of lines) {
      if (line.includes('问题') || line.includes('风险') || line.includes('建议') || line.includes('改进')) {
        conclusion = line.substring(0, 100);
        break;
      }
    }
    
    // 构建简单的位置摘要
    const position: PositionSummary = {
      conclusion,
      key_reasons: [
        '发现了一些潜在问题',
        '需要优化和改进',
        '建议调整计划'
      ],
      assumptions: [
        '计划可以改进',
        '风险可以规避'
      ],
      confidence: 0.65
    };
    
    // 构建简单的批评结构
    const targetRound = context.planner_output?.round || round;
    const critique: Critique = {
      target_agent: 'planner',
      target_round: targetRound,
      risks: [
        {
          risk: 'AI输出格式问题导致无法详细分析',
          severity: 'medium',
          impact: '批评内容可能不够结构化'
        }
      ],
      suggestions: [
        {
          issue: '需要更清晰的批评',
          solution: '在下一轮提供更结构化的批评',
          priority: 'medium'
        }
      ],
      validity_check: {
        feasible: true,
        realistic: true,
        complete: false
      }
    };
    
    // 保存位置摘要
    this.lastPosition = position;
    
    const output: AgentOutput = {
      agent_id: this.agentId,
      round,
      output_type: 'critique',
      content: `# 批评与建议\n\n${response}\n\n---\n\n⚠️  **注意**：由于AI输出格式问题，使用了简化的批评结构。讨论仍将继续。`,
      metadata: {
        position,
        critique,
        fallback: true,
        raw_response: response.substring(0, 500)
      },
      timestamp: new Date().toISOString(),
    };
    
    console.log(`✅ [Critic] Fallback输出创建成功`);
    return output;
  }

  /**
   * 格式化批评内容为用户可读文本
   */
  private formatCritiqueContent(critique: Critique, position: PositionSummary): string {
    let content = `# 批评与建议\n\n`;
    
    content += `**针对**: ${critique.target_agent} (第${critique.target_round}轮)\n\n`;
    
    content += `## 我的评价\n\n`;
    content += `${position.conclusion}\n\n`;
    
    content += `**主要问题**:\n`;
    position.key_reasons.forEach((reason, i) => {
      content += `${i + 1}. ${reason}\n`;
    });
    content += `\n`;
    
    content += `**置信度**: ${(position.confidence * 100).toFixed(0)}%\n\n`;
    
    // 可行性检查
    content += `## 可行性检查\n\n`;
    content += `- **可行性**: ${critique.validity_check.feasible ? '✅ 可行' : '❌ 不可行'}\n`;
    content += `- **现实性**: ${critique.validity_check.realistic ? '✅ 现实' : '❌ 不现实'}\n`;
    content += `- **完整性**: ${critique.validity_check.complete ? '✅ 完整' : '⚠️ 不完整'}\n\n`;
    
    // 风险评估
    if (critique.risks.length > 0) {
      content += `## 风险评估\n\n`;
      critique.risks.forEach((risk, i) => {
        const severityIcon = risk.severity === 'high' ? '🔴' : risk.severity === 'medium' ? '🟡' : '🟢';
        content += `${i + 1}. ${severityIcon} **${risk.risk}** (${risk.severity})\n`;
        content += `   - 影响: ${risk.impact}\n\n`;
      });
    }
    
    // 改进建议
    if (critique.suggestions.length > 0) {
      content += `## 改进建议\n\n`;
      critique.suggestions.forEach((suggestion, i) => {
        const priorityIcon = suggestion.priority === 'high' ? '🔥' : suggestion.priority === 'medium' ? '⚡' : '💡';
        content += `${i + 1}. ${priorityIcon} **${suggestion.issue}** (${suggestion.priority})\n`;
        content += `   - 解决方案: ${suggestion.solution}\n\n`;
      });
    }
    
    return content;
  }
}

