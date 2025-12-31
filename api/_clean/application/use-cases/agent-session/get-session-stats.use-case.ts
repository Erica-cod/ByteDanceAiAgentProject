/**
 * GetSessionStatsUseCase - 获取 Agent 会话统计信息
 * 
 * 用于监控和分析多 Agent 会话的使用情况
 */

import type { IAgentSessionRepository } from '../../interfaces/repositories/agent-session.repository.interface.js';

export interface GetSessionStatsOutput {
  total: number;
  byRound: Record<number, number>;
}

export class GetSessionStatsUseCase {
  constructor(private agentSessionRepository: IAgentSessionRepository) {}

  async execute(): Promise<GetSessionStatsOutput> {
    try {
      const stats = await this.agentSessionRepository.getStats();

      console.log(
        `📊 [GetSessionStats] 当前活跃会话: ${stats.total}个，` +
        `按轮次: ${JSON.stringify(stats.byRound)}`
      );

      return stats;
    } catch (error: any) {
      console.error('❌ [GetSessionStats] 获取统计信息失败:', error);
      return {
        total: 0,
        byRound: {},
      };
    }
  }
}

