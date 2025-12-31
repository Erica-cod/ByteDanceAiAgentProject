/**
 * SaveSessionUseCase - 保存 Agent 会话状态
 * 
 * 用于在多 Agent 协作过程中保存中间状态，支持断点续传
 */

import type { IAgentSessionRepository } from '../../interfaces/repositories/agent-session.repository.interface.js';
import { AgentSessionEntity } from '../../../domain/entities/agent-session.entity.js';

export interface SaveSessionInput {
  conversationId: string;
  userId: string;
  assistantMessageId: string;
  completedRounds: number;
  sessionState: any;
  userQuery: string;
}

export interface SaveSessionOutput {
  success: boolean;
  sessionId: string;
}

export class SaveSessionUseCase {
  constructor(private agentSessionRepository: IAgentSessionRepository) {}

  async execute(input: SaveSessionInput): Promise<SaveSessionOutput> {
    const startTime = Date.now();
    const sessionId = `${input.conversationId}:${input.assistantMessageId}`;

    try {
      // 尝试加载现有会话
      const existingSession = await this.agentSessionRepository.findByIdentifiers(
        input.conversationId,
        input.userId,
        input.assistantMessageId
      );

      let session: AgentSessionEntity;

      if (existingSession) {
        // 更新现有会话
        existingSession.updateState(input.completedRounds, input.sessionState);
        session = existingSession;
        
        console.log(
          `💾 [SaveSession] 更新会话: ${sessionId} (第 ${input.completedRounds} 轮)`
        );
      } else {
        // 创建新会话
        session = AgentSessionEntity.create(
          input.conversationId,
          input.userId,
          input.assistantMessageId,
          input.userQuery,
          input.sessionState,
          5 // TTL: 5分钟
        );

        // 如果有 completedRounds，更新状态
        if (input.completedRounds > 0) {
          session.updateState(input.completedRounds, input.sessionState);
        }

        console.log(
          `💾 [SaveSession] 创建会话: ${sessionId} (第 ${input.completedRounds} 轮)`
        );
      }

      // 保存到数据库
      const success = await this.agentSessionRepository.save(session);

      const elapsed = Date.now() - startTime;
      
      if (success) {
        console.log(`✅ [SaveSession] 保存成功: ${sessionId}, 耗时 ${elapsed}ms`);
      } else {
        console.error(`❌ [SaveSession] 保存失败: ${sessionId}, 耗时 ${elapsed}ms`);
      }

      return {
        success,
        sessionId,
      };
    } catch (error: any) {
      console.error(`❌ [SaveSession] 保存会话失败: ${sessionId}`, error);
      return {
        success: false,
        sessionId,
      };
    }
  }
}

