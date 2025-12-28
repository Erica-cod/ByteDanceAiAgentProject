/**
 * Multi-Agent Orchestrator - 多Agent协作编排器
 * 
 * 核心功能：
 * - 管理多个Agent的协作流程
 * - 控制讨论轮次和顺序
 * - 处理Agent之间的信息传递
 * - 生成最终报告
 */

import { PlannerAgent } from '../agents/plannerAgent.js';
import { CriticAgent } from '../agents/criticAgent.js';
import { ReporterAgent } from '../agents/reporterAgent.js';
import { HostAgent } from '../agents/hostAgent.js';
import type { AgentOutput } from '../agents/baseAgent.js';
import type { HostDecision } from '../agents/hostAgent.js';

/**
 * 多Agent会话状态
 */
export interface MultiAgentSession {
  session_id: string;
  user_query: string;
  mode: 'multi_agent';
  status: 'in_progress' | 'converged' | 'terminated';
  current_round: number;
  max_rounds: number;
  agents: {
    planner: { status: string; last_output?: AgentOutput };
    critic: { status: string; last_output?: AgentOutput };
    host: { status: string; last_output?: AgentOutput };
    reporter: { status: string; last_output?: AgentOutput };
  };
  history: Array<{
    round: number;
    outputs: AgentOutput[];
  }>;
  consensus_trend: number[];
  created_at: string;
  updated_at: string;
}

/**
 * 编排器配置
 */
export interface OrchestratorConfig {
  maxRounds?: number;        // 最大轮次，默认5
  userId: string;            // 用户ID
  conversationId: string;    // 会话ID
  resumeFromRound?: number;  // ✅ 从指定轮次恢复（用于断点续传）
  initialState?: Partial<MultiAgentSession>;  // ✅ 初始状态（用于恢复）
  connectionChecker?: () => boolean; // ✅ 连接状态检查器（检测SSE连接是否断开）
}

/**
 * 编排器回调
 */
export interface OrchestratorCallbacks {
  onAgentStart?: (agentId: string, round: number) => void | Promise<void>;  // ✅ 新增：Agent开始
  onAgentChunk?: (agentId: string, round: number, chunk: string) => void | Promise<void>;  // ✅ 新增：流式内容
  onAgentComplete?: (output: AgentOutput) => void | Promise<void>;  // ✅ 重命名：原 onAgentOutput
  onHostDecision?: (decision: HostDecision, analysis: any) => void | Promise<void>;
  onRoundComplete?: (round: number) => void | Promise<void>;
  onSessionComplete?: (session: MultiAgentSession) => void | Promise<void>;
}

/**
 * Multi-Agent Orchestrator
 */
export class MultiAgentOrchestrator {
  private planner: PlannerAgent;
  private critic: CriticAgent;
  private reporter: ReporterAgent;
  private host: HostAgent;

  private session: MultiAgentSession;
  private callbacks: OrchestratorCallbacks;
  private connectionChecker?: () => boolean; // ✅ 连接状态检查器

  constructor(config: OrchestratorConfig, callbacks: OrchestratorCallbacks = {}) {
    this.connectionChecker = config.connectionChecker;
    // 初始化所有Agent
    this.planner = new PlannerAgent();
    this.critic = new CriticAgent();
    this.reporter = new ReporterAgent();
    this.host = new HostAgent();

    this.callbacks = callbacks;

    // ✅ 支持从保存的状态恢复
    if (config.initialState) {
      console.log(`🔄 [Orchestrator] 从已保存状态恢复 (第 ${config.initialState.current_round} 轮)`);
      this.session = {
        session_id: config.initialState.session_id || `session_${Date.now()}`,
        user_query: config.initialState.user_query || '',
        mode: 'multi_agent',
        status: config.initialState.status || 'in_progress',
        current_round: config.initialState.current_round || 0,
        max_rounds: config.maxRounds || config.initialState.max_rounds || 5,
        agents: config.initialState.agents || {
          planner: { status: 'idle' },
          critic: { status: 'idle' },
          host: { status: 'idle' },
          reporter: { status: 'idle' },
        },
        history: config.initialState.history || [],
        consensus_trend: config.initialState.consensus_trend || [],
        created_at: config.initialState.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    } else {
      // 初始化会话状态
      this.session = {
        session_id: `session_${Date.now()}`,
        user_query: '',
        mode: 'multi_agent',
        status: 'in_progress',
        current_round: 0,
        max_rounds: config.maxRounds || 5,
        agents: {
          planner: { status: 'idle' },
          critic: { status: 'idle' },
          host: { status: 'idle' },
          reporter: { status: 'idle' },
        },
        history: [],
        consensus_trend: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
  }

  /**
   * 运行多Agent协作流程
   * 
   * @param userQuery - 用户查询
   * @returns 最终会话状态
   */
  async run(userQuery: string, resumeFromRound?: number): Promise<MultiAgentSession> {
    console.log(`\n🚀 [Orchestrator] 启动多Agent协作...`);
    console.log(`📝 [Orchestrator] 用户查询: ${userQuery}`);
    console.log(`⚙️  [Orchestrator] 最大轮次: ${this.session.max_rounds}`);
    
    // ✅ 断点续传支持
    const startRound = resumeFromRound || 1;
    if (resumeFromRound && resumeFromRound > 1) {
      console.log(`🔄 [Orchestrator] 从第 ${resumeFromRound} 轮继续（断点续传）`);
    }

    this.session.user_query = userQuery;

    try {
      // 主循环：最多执行 max_rounds 轮
      for (let round = startRound; round <= this.session.max_rounds; round++) {
        // ✅ 检查连接状态（防止前端刷新后继续浪费token）
        if (this.connectionChecker && !this.connectionChecker()) {
          console.warn(`⚠️  [Orchestrator] 检测到SSE连接断开，停止生成（第 ${round} 轮）`);
          this.session.status = 'terminated';
          break;
        }
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🔄 [Orchestrator] 第 ${round} 轮开始`);
        console.log(`${'='.repeat(60)}`);

        this.session.current_round = round;
        const roundOutputs: AgentOutput[] = [];

        // 1. Planner生成计划（流式）
        console.log(`\n📋 [Orchestrator] Planner 生成计划...`);
        this.session.agents.planner.status = 'running';
        
        // ✅ 生成前检查连接
        if (this.connectionChecker && !this.connectionChecker()) {
          console.warn(`⚠️  [Orchestrator] 连接断开，跳过Planner生成`);
          break;
        }
        
        const plannerContext = this.buildPlannerContext(round);
        const plannerOutput = await this.generateWithStreaming(
          this.planner,
          'planner',
          userQuery,
          plannerContext,
          round
        );
        
        this.session.agents.planner.status = 'completed';
        this.session.agents.planner.last_output = plannerOutput;
        roundOutputs.push(plannerOutput);

        // 2. Critic批评计划（流式）
        console.log(`\n🔍 [Orchestrator] Critic 批评计划...`);
        this.session.agents.critic.status = 'running';
        
        // ✅ 生成前检查连接
        if (this.connectionChecker && !this.connectionChecker()) {
          console.warn(`⚠️  [Orchestrator] 连接断开，跳过Critic生成`);
          break;
        }
        
        const criticContext = this.buildCriticContext(round, plannerOutput);
        const criticOutput = await this.generateWithStreaming(
          this.critic,
          'critic',
          userQuery,
          criticContext,
          round
        );
        
        this.session.agents.critic.status = 'completed';
        this.session.agents.critic.last_output = criticOutput;
        roundOutputs.push(criticOutput);

        // 3. Host分析并决策（流式）
        console.log(`\n🎯 [Orchestrator] Host 分析决策...`);
        this.session.agents.host.status = 'running';
        
        // ✅ 生成前检查连接
        if (this.connectionChecker && !this.connectionChecker()) {
          console.warn(`⚠️  [Orchestrator] 连接断开，跳过Host生成`);
          break;
        }
        
        const hostContext = this.buildHostContext(round, plannerOutput, criticOutput);
        const hostOutput = await this.generateWithStreaming(
          this.host,
          'host',
          userQuery,
          hostContext,
          round
        );
        
        this.session.agents.host.status = 'completed';
        this.session.agents.host.last_output = hostOutput;
        roundOutputs.push(hostOutput);

        const hostDecision: HostDecision = hostOutput.metadata.decision;
        const hostAnalysis = hostOutput.metadata.analysis;

        // 更新共识趋势
        this.session.consensus_trend.push(hostAnalysis.consensus_level);

        if (this.callbacks.onHostDecision) {
          await this.callbacks.onHostDecision(hostDecision, hostAnalysis);
        }

        // 保存本轮历史
        this.session.history.push({
          round,
          outputs: roundOutputs,
        });

        if (this.callbacks.onRoundComplete) {
          await this.callbacks.onRoundComplete(round);
        }

        // 4. 根据Host决策判断是否继续
        console.log(`\n🤔 [Orchestrator] Host决策: ${hostDecision.action}`);

        if (hostDecision.action === 'converge' || hostDecision.action === 'terminate') {
          console.log(`✅ [Orchestrator] 讨论结束，准备生成报告...`);
          this.session.status = hostDecision.action === 'converge' ? 'converged' : 'terminated';
          break;
        }

        // 如果是强制反方，下一轮只让Critic发言
        if (hostDecision.action === 'force_opposition') {
          console.log(`⚠️ [Orchestrator] 强制反方模式，下一轮仅Critic发言`);
          // 下一轮的context会包含force_opposition标志
        }

        console.log(`🔄 [Orchestrator] 继续下一轮讨论...`);
      }

      // 5. 生成最终报告（流式）
      console.log(`\n📝 [Orchestrator] Reporter 生成最终报告...`);
      this.session.agents.reporter.status = 'running';
      
      // ✅ 生成前检查连接
      if (this.connectionChecker && !this.connectionChecker()) {
        console.warn(`⚠️  [Orchestrator] 连接断开，跳过Reporter生成`);
        this.session.status = 'terminated';
        return this.session;
      }
      
      const reporterContext = this.buildReporterContext();
      const reporterOutput = await this.generateWithStreaming(
        this.reporter,
        'reporter',
        this.session.user_query,
        reporterContext,
        this.session.current_round + 1
      );
      
      this.session.agents.reporter.status = 'completed';
      this.session.agents.reporter.last_output = reporterOutput;

      // 将Reporter输出添加到最后一轮
      if (this.session.history.length > 0) {
        this.session.history[this.session.history.length - 1].outputs.push(reporterOutput);
      } else {
        this.session.history.push({
          round: 1,
          outputs: [reporterOutput],
        });
      }

      // 6. 完成会话
      this.session.updated_at = new Date().toISOString();
      
      if (this.callbacks.onSessionComplete) {
        await this.callbacks.onSessionComplete(this.session);
      }

      console.log(`\n✅ [Orchestrator] 多Agent协作完成！`);
      console.log(`📊 [Orchestrator] 总轮次: ${this.session.current_round}`);
      console.log(`📊 [Orchestrator] 最终状态: ${this.session.status}`);

      return this.session;
    } catch (error: any) {
      console.error(`❌ [Orchestrator] 协作失败:`, error);
      this.session.status = 'terminated';
      this.session.updated_at = new Date().toISOString();
      throw error;
    }
  }

  /**
   * 构建Planner的上下文
   */
  private buildPlannerContext(round: number): any {
    const context: any = {
      round,
      max_rounds: this.session.max_rounds,
    };

    // 如果是后续轮次，添加Critic的反馈
    if (round > 1 && this.session.agents.critic.last_output) {
      context.critic_output = this.session.agents.critic.last_output;
    }

    // 如果Host有特殊指示
    if (this.session.agents.host.last_output) {
      const hostDecision: HostDecision = this.session.agents.host.last_output.metadata.decision;
      if (hostDecision.constraints) {
        context.host_instructions = this.formatHostInstructions(hostDecision);
      }
    }

    return context;
  }

  /**
   * 构建Critic的上下文
   */
  private buildCriticContext(round: number, plannerOutput: AgentOutput): any {
    const context: any = {
      round,
      max_rounds: this.session.max_rounds,
      planner_output: plannerOutput,
    };

    // 如果Host要求强制反方
    if (this.session.agents.host.last_output) {
      const hostDecision: HostDecision = this.session.agents.host.last_output.metadata.decision;
      if (hostDecision.action === 'force_opposition') {
        context.force_opposition = true;
      }
      if (hostDecision.constraints) {
        context.host_instructions = this.formatHostInstructions(hostDecision);
      }
    }

    return context;
  }

  /**
   * 构建Host的上下文
   */
  private buildHostContext(
    round: number,
    plannerOutput: AgentOutput,
    criticOutput: AgentOutput
  ): any {
    const context: any = {
      round,
      max_rounds: this.session.max_rounds,
      planner_output: plannerOutput,
      critic_output: criticOutput,
    };

    // 添加上一轮的输出（用于自相似度检测）
    if (round > 1 && this.session.history.length > 0) {
      const previousRound = this.session.history[this.session.history.length - 1];
      const previousPlanner = previousRound.outputs.find(o => o.agent_id === 'planner');
      const previousCritic = previousRound.outputs.find(o => o.agent_id === 'critic');

      if (previousPlanner) {
        context.planner_previous_output = previousPlanner;
      }
      if (previousCritic) {
        context.critic_previous_output = previousCritic;
      }
    }

    return context;
  }

  /**
   * 构建Reporter的上下文
   */
  private buildReporterContext(): any {
    const context: any = {
      discussion_history: this.session.history,
    };

    // 添加最终的Planner和Critic输出
    if (this.session.agents.planner.last_output) {
      context.final_planner_output = this.session.agents.planner.last_output;
    }
    if (this.session.agents.critic.last_output) {
      context.final_critic_output = this.session.agents.critic.last_output;
    }

    // 添加共识信息
    if (this.session.agents.host.last_output) {
      const hostAnalysis = this.session.agents.host.last_output.metadata.analysis;
      context.consensus_info = {
        mean_similarity: hostAnalysis.consensus_level,
        level: this.getConsensusLevel(hostAnalysis.consensus_level),
        trend: hostAnalysis.trend,
      };
    }

    return context;
  }

  /**
   * 格式化Host的指示
   */
  private formatHostInstructions(decision: HostDecision): string {
    let instructions = `**Host指示**:\n\n`;
    
    if (decision.constraints?.must_address && decision.constraints.must_address.length > 0) {
      instructions += `必须解决的问题:\n`;
      decision.constraints.must_address.forEach(issue => {
        instructions += `- ${issue}\n`;
      });
      instructions += `\n`;
    }

    if (decision.constraints?.avoid && decision.constraints.avoid.length > 0) {
      instructions += `避免的行为:\n`;
      decision.constraints.avoid.forEach(avoid => {
        instructions += `- ${avoid}\n`;
      });
    }

    return instructions;
  }

  /**
   * 获取共识水平描述
   */
  private getConsensusLevel(similarity: number): 'high' | 'medium' | 'low' {
    if (similarity > 0.85) return 'high';
    if (similarity > 0.70) return 'medium';
    return 'low';
  }

  /**
   * ✅ 新增：带流式回调的Agent生成（包装generate方法）
   * 
   * 这个方法在调用agent.generate之前，先hook callModel方法来实现流式推送
   */
  private async generateWithStreaming(
    agent: any,
    agentId: string,
    userQuery: string,
    context: any,
    round: number
  ): Promise<AgentOutput> {
    // 通知开始
    if (this.callbacks.onAgentStart) {
      await this.callbacks.onAgentStart(agentId, round);
    }
    
    // 保存原始的callModel方法
    const originalCallModel = agent.callModel.bind(agent);
    
    // 临时替换callModel方法，添加流式回调
    agent.callModel = async (messages: any[], onChunk?: any) => {
      return await originalCallModel(messages, async (chunk: string) => {
        // 实时推送chunk
        if (this.callbacks.onAgentChunk) {
          await this.callbacks.onAgentChunk(agentId, round, chunk);
        }
      });
    };
    
    try {
      // 调用原有的generate方法（它内部会调用我们修改后的callModel）
      const output = await agent.generate(userQuery, context, round);
      
      // 通知完成
      if (this.callbacks.onAgentComplete) {
        await this.callbacks.onAgentComplete(output);
      }
      
      return output;
    } finally {
      // 恢复原始的callModel方法
      agent.callModel = originalCallModel;
    }
  }

  /**
   * 获取当前会话状态
   */
  getSession(): MultiAgentSession {
    return this.session;
  }

  /**
   * ✅ 序列化会话状态（用于 Redis 缓存）
   * 
   * 将会话状态序列化为 JSON，用于断点续传
   */
  serializeState(): string {
    return JSON.stringify(this.session);
  }

  /**
   * ✅ 从序列化状态恢复（用于断点续传）
   * 
   * @param serializedState - 序列化的会话状态
   */
  restoreFromState(serializedState: string): void {
    const restoredSession = JSON.parse(serializedState) as MultiAgentSession;
    this.session = {
      ...restoredSession,
      updated_at: new Date().toISOString(), // 更新时间戳
    };
    console.log(`✅ [Orchestrator] 已从保存状态恢复 (第 ${this.session.current_round} 轮)`);
  }

  /**
   * 重置编排器
   */
  reset(): void {
    this.planner.reset();
    this.critic.reset();
    this.reporter.reset();
    this.host.reset();

    this.session = {
      session_id: `session_${Date.now()}`,
      user_query: '',
      mode: 'multi_agent',
      status: 'in_progress',
      current_round: 0,
      max_rounds: this.session.max_rounds,
      agents: {
        planner: { status: 'idle' },
        critic: { status: 'idle' },
        host: { status: 'idle' },
        reporter: { status: 'idle' },
      },
      history: [],
      consensus_trend: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
}

