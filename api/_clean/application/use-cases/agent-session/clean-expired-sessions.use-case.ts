/**
 * CleanExpiredSessionsUseCase - 清理过期的 Agent 会话
 * 
 * 用于定期清理过期的会话状态，释放存储空间
 * 注意：MongoDB TTL 索引会自动清理过期数据，这个方法是备用的
 */

import type { IAgentSessionRepository } from '../../interfaces/repositories/agent-session.repository.interface.js';

export interface CleanExpiredSessionsOutput {
  deletedCount: number;
}

export class CleanExpiredSessionsUseCase {
  constructor(private agentSessionRepository: IAgentSessionRepository) {}

  async execute(): Promise<CleanExpiredSessionsOutput> {
    try {
      const deletedCount = await this.agentSessionRepository.cleanExpired();

      if (deletedCount > 0) {
        console.log(`🧹 [CleanExpiredSessions] 清理了 ${deletedCount} 个过期会话`);
      } else {
        console.log(`✅ [CleanExpiredSessions] 没有过期会话需要清理`);
      }

      return { deletedCount };
    } catch (error: any) {
      console.error('❌ [CleanExpiredSessions] 清理过期会话失败:', error);
      return { deletedCount: 0 };
    }
  }
}

