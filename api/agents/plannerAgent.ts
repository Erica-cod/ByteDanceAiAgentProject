/**
 * Planner Agent - 规划师
 * 
 * 职责：
 * - 将用户目标拆解成结构化计划
 * - 生成任务列表、估算时间、设定截止日期
 * - 考虑可行性和资源约束
 */

import { BaseAgent, type AgentOutput, type PositionSummary, type AgentConfig } from './baseAgent.js';
import { getNow, calculateDate, parseNaturalDate } from '../tools/plugins/timeTools.js';

/**
 * 计划阶段
 */
export interface PlanPhase {
  phase_name: string;
  duration: string;
  tasks: Array<{
    title: string;
    estimated_hours: number;
    deadline?: string;
    tags?: string[];
  }>;
}

/**
 * 计划结构
 */
export interface Plan {
  title: string;
  goal: string;
  phases: PlanPhase[];
  total_estimated_hours: number;
}

/**
 * Planner 输出元数据
 */
export interface PlannerMetadata {
  position: PositionSummary;
  plan: Plan;
}

/**
 * Planner Agent
 */
export class PlannerAgent extends BaseAgent {
  constructor(config?: Partial<AgentConfig>) {
    super({
      agentId: 'planner',
      temperature: 0.7,
      maxTokens: 3000,
      ...config,
    });
  }

  protected getDefaultSystemPrompt(): string {
    return `你是一位专业的规划师（Planner），擅长将用户的目标拆解成可执行的结构化计划。

## 你的职责

1. **理解用户目标**：深入分析用户想要达成的目标
2. **拆解任务**：将大目标分解为具体的、可执行的任务
3. **估算时间**：为每个任务估算所需时间（小时数）
4. **设定截止日期**：根据任务优先级和依赖关系设定合理的截止日期
5. **分阶段规划**：将任务组织成逻辑清晰的阶段

## 输出要求

你必须输出以下JSON结构（使用 \`\`\`json 代码块包裹）：

\`\`\`json
{
  "position": {
    "conclusion": "一句话总结你的规划方案",
    "key_reasons": ["理由1", "理由2", "理由3"],
    "assumptions": ["假设1", "假设2"],
    "confidence": 0.85
  },
  "plan": {
    "title": "计划标题",
    "goal": "目标描述",
    "phases": [
      {
        "phase_name": "阶段1名称",
        "duration": "持续时间（如：6周）",
        "tasks": [
          {
            "title": "任务标题",
            "estimated_hours": 42,
            "deadline": "2025-01-15",
            "tags": ["tag1", "tag2"]
          }
        ]
      }
    ],
    "total_estimated_hours": 180
  }
}
\`\`\`

## 规划原则

1. **SMART原则**：任务要具体(Specific)、可衡量(Measurable)、可达成(Achievable)、相关(Relevant)、有时限(Time-bound)
2. **优先级排序**：重要且紧急的任务优先
3. **依赖关系**：考虑任务之间的前后依赖
4. **缓冲时间**：预留10-20%的缓冲时间应对意外
5. **里程碑**：设置关键里程碑便于跟踪进度

## 注意事项

- 时间估算要现实，不要过于乐观
- 考虑用户的实际可用时间和能力
- 提供清晰的阶段划分，便于执行
- 标签(tags)要有意义，便于分类和筛选

现在，请根据用户的需求和上下文信息，生成一个详细的结构化计划。`;
  }

  async generate(
    userQuery: string,
    context: any,
    round: number
  ): Promise<AgentOutput> {
    console.log(`\n📋 [Planner] 第 ${round} 轮规划开始...`);
    console.log(`📝 [Planner] 用户查询: ${userQuery}`);

    try {
      // 构建上下文消息
      const contextMessages: string[] = [];

      // 添加当前时间信息
      const timeInfo = getNow();
      contextMessages.push(
        `当前时间信息：\n- 日期: ${timeInfo.date}\n- 星期: ${timeInfo.weekday}\n- 时区: ${timeInfo.timezone}`
      );

      // 如果有其他Agent的输出，添加到上下文
      if (context.critic_output) {
        contextMessages.push(
          `Critic的反馈：\n${context.critic_output.content}\n\n请根据Critic的建议优化你的计划。`
        );
      }

      if (context.host_instructions) {
        contextMessages.push(
          `Host的指示：\n${context.host_instructions}`
        );
      }

      // 如果是后续轮次，提醒要有变化
      if (round > 1 && this.lastPosition) {
        contextMessages.push(
          `这是第 ${round} 轮规划。你上一轮的结论是："${this.lastPosition.conclusion}"。\n` +
          `请根据新的反馈进行调整，不要简单重复之前的方案。`
        );
      }

      // 构建消息并调用模型
      const messages = this.buildMessages(userQuery, contextMessages);
      const response = await this.callModel(messages);

      // 提取JSON
      const jsonData = this.extractJSON(response);
      
      // 如果JSON解析失败或不完整，使用fallback机制
      if (!jsonData) {
        console.warn(`⚠️  [Planner] JSON提取完全失败，使用fallback提取策略`);
        console.warn(`   完整响应内容:\n${response.substring(0, 1000)}`);
        return this.createFallbackOutput(response, round, userQuery);
      }
      
      if (!jsonData.position || !jsonData.plan) {
        console.warn(`⚠️  [Planner] JSON结构不完整`);
        console.warn(`   - position存在: ${!!jsonData.position}`);
        console.warn(`   - plan存在: ${!!jsonData.plan}`);
        console.warn(`   - JSON keys: ${Object.keys(jsonData).join(', ')}`);
        return this.createFallbackOutput(response, round, userQuery);
      }

      // 构建输出
      const output: AgentOutput = {
        agent_id: this.agentId,
        round,
        output_type: 'plan',
        content: this.formatPlanContent(jsonData.plan, jsonData.position),
        metadata: {
          position: jsonData.position,
          plan: jsonData.plan,
        },
        timestamp: new Date().toISOString(),
      };

      // 保存到历史
      this.saveToHistory(output);

      console.log(`✅ [Planner] 第 ${round} 轮规划完成`);
      console.log(`📊 [Planner] 计划: ${jsonData.plan.title}, 总工时: ${jsonData.plan.total_estimated_hours}h`);

      return output;
    } catch (error: any) {
      console.error(`❌ [Planner] 生成失败:`, error);
      
      // 返回错误输出
      return {
        agent_id: this.agentId,
        round,
        output_type: 'error',
        content: `规划生成失败: ${error.message}`,
        metadata: { error: error.message },
        timestamp: new Date().toISOString(),
      };
    }
  }

  protected extractPosition(content: string, metadata: any): PositionSummary {
    if (metadata && metadata.position) {
      return metadata.position;
    }

    // Fallback: 从内容中提取
    return {
      conclusion: '生成结构化计划',
      key_reasons: ['任务拆解', '时间估算', '阶段划分'],
      assumptions: ['用户有足够时间执行'],
      confidence: 0.7,
    };
  }

  /**
   * 创建fallback输出（当JSON解析失败时）
   */
  private createFallbackOutput(response: string, round: number, userQuery: string): AgentOutput {
    console.log(`🔧 [Planner] 使用fallback机制提取信息...`);
    
    // 从原始文本中提取关键信息
    const lines = response.split('\n').map(l => l.trim()).filter(l => l);
    
    // 尝试提取结论（通常包含"建议"、"应该"、"计划"等关键词）
    let conclusion = '根据需求制定了初步计划';
    for (const line of lines) {
      if (line.includes('建议') || line.includes('应该') || line.includes('计划') || line.includes('目标')) {
        conclusion = line.substring(0, 100);
        break;
      }
    }
    
    // 构建简单的位置摘要
    const position: PositionSummary = {
      conclusion,
      key_reasons: [
        '根据用户需求分析',
        '考虑实际可行性',
        '结合时间和资源约束'
      ],
      assumptions: [
        '用户有足够的时间投入',
        '外部环境相对稳定'
      ],
      confidence: 0.7
    };
    
    // 构建简单的计划结构
    const plan: Plan = {
      title: `${userQuery.substring(0, 30)}计划`,
      goal: userQuery,
      phases: [
        {
          phase_name: '执行阶段',
          duration: '待定',
          tasks: [
            {
              title: '详细规划（AI输出格式问题，需要重新生成）',
              estimated_hours: 0,
              deadline: '待定',
              tags: ['规划']
            }
          ]
        }
      ],
      total_estimated_hours: 0
    };
    
    // 保存位置摘要
    this.lastPosition = position;
    
    const output: AgentOutput = {
      agent_id: this.agentId,
      round,
      output_type: 'plan',
      content: `# ${plan.title}\n\n${response}\n\n---\n\n⚠️  **注意**：由于AI输出格式问题，使用了简化的计划结构。讨论仍将继续。`,
      metadata: {
        position,
        plan,
        fallback: true,
        raw_response: response.substring(0, 500)
      },
      timestamp: new Date().toISOString(),
    };
    
    console.log(`✅ [Planner] Fallback输出创建成功`);
    return output;
  }

  /**
   * 格式化计划内容为用户可读文本
   */
  private formatPlanContent(plan: Plan, position: PositionSummary): string {
    let content = `# ${plan.title}\n\n`;
    content += `**目标**: ${plan.goal}\n\n`;
    content += `**总预计工时**: ${plan.total_estimated_hours} 小时\n\n`;
    
    content += `## 我的方案\n\n`;
    content += `${position.conclusion}\n\n`;
    
    content += `**关键理由**:\n`;
    position.key_reasons.forEach((reason, i) => {
      content += `${i + 1}. ${reason}\n`;
    });
    content += `\n`;
    
    content += `**基于假设**:\n`;
    position.assumptions.forEach((assumption, i) => {
      content += `- ${assumption}\n`;
    });
    content += `\n`;
    
    content += `**置信度**: ${(position.confidence * 100).toFixed(0)}%\n\n`;
    
    content += `## 详细计划\n\n`;
    
    plan.phases.forEach((phase, phaseIndex) => {
      content += `### 阶段 ${phaseIndex + 1}: ${phase.phase_name}\n`;
      content += `**持续时间**: ${phase.duration}\n\n`;
      
      phase.tasks.forEach((task, taskIndex) => {
        content += `${taskIndex + 1}. **${task.title}**\n`;
        content += `   - 预计工时: ${task.estimated_hours}小时\n`;
        if (task.deadline) {
          content += `   - 截止日期: ${task.deadline}\n`;
        }
        if (task.tags && task.tags.length > 0) {
          content += `   - 标签: ${task.tags.join(', ')}\n`;
        }
        content += `\n`;
      });
    });
    
    return content;
  }
}

