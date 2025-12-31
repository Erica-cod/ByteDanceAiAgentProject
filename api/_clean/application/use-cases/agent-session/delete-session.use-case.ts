/**
 * DeleteSessionUseCase - 删除 Agent 会话状态
 * 
 * 用于在多 Agent 协作完成或取消时清理会话状态
 */

import type { IAgentSessionRepository } from '../../interfaces/repositories/agent-session.repository.interface.js';

export interface DeleteSessionInput {
  conversationId: string;
  userId: string;
  assistantMessageId: string;
}

export interface DeleteSessionOutput {
  success: boolean;
  sessionId: string;
}

export class DeleteSessionUseCase {
  constructor(private agentSessionRepository: IAgentSessionRepository) {}

  async execute(input: DeleteSessionInput): Promise<DeleteSessionOutput> {
    const sessionId = `${input.conversationId}:${input.assistantMessageId}`;

    try {
      const success = await this.agentSessionRepository.delete(
        input.conversationId,
        input.userId,
        input.assistantMessageId
      );

      if (success) {
        console.log(`🗑️  [DeleteSession] 删除会话: ${sessionId}`);
      } else {
        console.log(`⚠️  [DeleteSession] 会话不存在或删除失败: ${sessionId}`);
      }

      return {
        success,
        sessionId,
      };
    } catch (error: any) {
      console.error(`❌ [DeleteSession] 删除会话失败: ${sessionId}`, error);
      return {
        success: false,
        sessionId,
      };
    }
  }
}

