/**
 * LoadSessionUseCase - 加载 Agent 会话状态
 * 
 * 用于从数据库恢复多 Agent 会话状态，支持断点续传
 */

import type { IAgentSessionRepository } from '../../interfaces/repositories/agent-session.repository.interface.js';

export interface LoadSessionInput {
  conversationId: string;
  userId: string;
  assistantMessageId: string;
}

export interface LoadSessionOutput {
  found: boolean;
  sessionId: string;
  data?: {
    completedRounds: number;
    sessionState: any;
    userQuery: string;
    updatedAt: Date;
  };
}

export class LoadSessionUseCase {
  constructor(private agentSessionRepository: IAgentSessionRepository) {}

  async execute(input: LoadSessionInput): Promise<LoadSessionOutput> {
    const startTime = Date.now();
    const sessionId = `${input.conversationId}:${input.assistantMessageId}`;

    try {
      const session = await this.agentSessionRepository.findByIdentifiers(
        input.conversationId,
        input.userId,
        input.assistantMessageId
      );

      const elapsed = Date.now() - startTime;

      if (!session) {
        console.log(`📭 [LoadSession] 未找到会话: ${sessionId}, 耗时 ${elapsed}ms`);
        return {
          found: false,
          sessionId,
        };
      }

      // 检查是否过期
      if (session.isExpired()) {
        console.log(`⏰ [LoadSession] 会话已过期: ${sessionId}, 耗时 ${elapsed}ms`);
        return {
          found: false,
          sessionId,
        };
      }

      console.log(
        `📦 [LoadSession] 恢复会话: ${sessionId} (第 ${session.completedRounds} 轮), 耗时 ${elapsed}ms`
      );

      return {
        found: true,
        sessionId,
        data: {
          completedRounds: session.completedRounds,
          sessionState: session.sessionState,
          userQuery: session.userQuery,
          updatedAt: session.updatedAt,
        },
      };
    } catch (error: any) {
      console.error(`❌ [LoadSession] 加载会话失败: ${sessionId}`, error);
      return {
        found: false,
        sessionId,
      };
    }
  }
}

