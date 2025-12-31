/**
 * AgentSessionEntity - 多 Agent 会话实体
 * 
 * 职责：
 * 1. 管理多 Agent 会话的状态数据
 * 2. 提供会话的创建、更新、过期检查等业务逻辑
 * 3. 确保会话数据的一致性和完整性
 * 
 * 为什么用 MongoDB 而不是 Redis：
 * 1. 低频操作：每个会话只保存5次（每轮一次），MongoDB性能完全够用
 * 2. 持久化需求：断点续传需要可靠的持久化，MongoDB原生支持
 * 3. 查询能力：可能需要按conversationId查询历史会话，MongoDB支持
 * 4. 数据规模可预测：最多200并发 × 10KB = 2MB，不需要Redis的极致性能
 * 5. 架构一致性：其他数据都在MongoDB，统一管理更简单
 */

import { z } from 'zod';

/**
 * AgentSession 状态架构
 */
const AgentSessionStateSchema = z.object({
  // 工作流状态
  completedRounds: z.number().int().min(0),
  sessionState: z.any(), // 多 Agent 编排器的内部状态（由 orchestrator 管理）
  userQuery: z.string(),
  
  // 元数据
  conversationId: z.string(),
  userId: z.string(),
  assistantMessageId: z.string(),
  
  // 时间戳
  createdAt: z.date(),
  updatedAt: z.date(),
  expiresAt: z.date(),
});

type AgentSessionState = z.infer<typeof AgentSessionStateSchema>;

/**
 * AgentSession 实体
 */
export class AgentSessionEntity {
  private _sessionId: string;
  private _conversationId: string;
  private _userId: string;
  private _assistantMessageId: string;
  private _completedRounds: number;
  private _sessionState: any;
  private _userQuery: string;
  private _createdAt: Date;
  private _updatedAt: Date;
  private _expiresAt: Date;

  private constructor(
    sessionId: string,
    conversationId: string,
    userId: string,
    assistantMessageId: string,
    completedRounds: number,
    sessionState: any,
    userQuery: string,
    createdAt: Date,
    updatedAt: Date,
    expiresAt: Date
  ) {
    this._sessionId = sessionId;
    this._conversationId = conversationId;
    this._userId = userId;
    this._assistantMessageId = assistantMessageId;
    this._completedRounds = completedRounds;
    this._sessionState = sessionState;
    this._userQuery = userQuery;
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
    this._expiresAt = expiresAt;
  }

  /**
   * 创建新的 Agent 会话
   */
  static create(
    conversationId: string,
    userId: string,
    assistantMessageId: string,
    userQuery: string,
    initialSessionState: any = {},
    ttlMinutes: number = 5
  ): AgentSessionEntity {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
    const sessionId = `${conversationId}:${assistantMessageId}`;

    return new AgentSessionEntity(
      sessionId,
      conversationId,
      userId,
      assistantMessageId,
      0, // 初始轮次为 0
      initialSessionState,
      userQuery,
      now,
      now,
      expiresAt
    );
  }

  /**
   * 从持久化数据重建实体
   */
  static fromPersistence(data: {
    sessionId: string;
    conversationId: string;
    userId: string;
    assistantMessageId: string;
    completedRounds: number;
    sessionState: any;
    userQuery: string;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date;
  }): AgentSessionEntity {
    // 验证数据
    AgentSessionStateSchema.parse({
      completedRounds: data.completedRounds,
      sessionState: data.sessionState,
      userQuery: data.userQuery,
      conversationId: data.conversationId,
      userId: data.userId,
      assistantMessageId: data.assistantMessageId,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      expiresAt: data.expiresAt,
    });

    return new AgentSessionEntity(
      data.sessionId,
      data.conversationId,
      data.userId,
      data.assistantMessageId,
      data.completedRounds,
      data.sessionState,
      data.userQuery,
      data.createdAt,
      data.updatedAt,
      data.expiresAt
    );
  }

  /**
   * 更新会话状态（完成一轮）
   */
  updateState(completedRounds: number, sessionState: any): void {
    if (completedRounds < this._completedRounds) {
      throw new Error(
        `无法回退轮次: 当前 ${this._completedRounds}, 尝试设置 ${completedRounds}`
      );
    }

    this._completedRounds = completedRounds;
    this._sessionState = sessionState;
    this._updatedAt = new Date();

    // 延长过期时间（每次更新都刷新TTL）
    const ttlMinutes = 5;
    this._expiresAt = new Date(this._updatedAt.getTime() + ttlMinutes * 60 * 1000);
  }

  /**
   * 检查会话是否已过期
   */
  isExpired(): boolean {
    return new Date() > this._expiresAt;
  }

  /**
   * 获取剩余有效时间（秒）
   */
  getRemainingTTL(): number {
    const now = new Date();
    const remainingMs = this._expiresAt.getTime() - now.getTime();
    return Math.max(0, Math.floor(remainingMs / 1000));
  }

  /**
   * 转换为持久化格式
   */
  toPersistence(): {
    sessionId: string;
    conversationId: string;
    userId: string;
    assistantMessageId: string;
    completedRounds: number;
    sessionState: any;
    userQuery: string;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date;
  } {
    return {
      sessionId: this._sessionId,
      conversationId: this._conversationId,
      userId: this._userId,
      assistantMessageId: this._assistantMessageId,
      completedRounds: this._completedRounds,
      sessionState: this._sessionState,
      userQuery: this._userQuery,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
      expiresAt: this._expiresAt,
    };
  }

  // ==================== Getters ====================

  get sessionId(): string {
    return this._sessionId;
  }

  get conversationId(): string {
    return this._conversationId;
  }

  get userId(): string {
    return this._userId;
  }

  get assistantMessageId(): string {
    return this._assistantMessageId;
  }

  get completedRounds(): number {
    return this._completedRounds;
  }

  get sessionState(): any {
    return this._sessionState;
  }

  get userQuery(): string {
    return this._userQuery;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get expiresAt(): Date {
    return this._expiresAt;
  }
}

