import { IStreamProgressRepository } from '../../application/interfaces/repositories/stream-progress.repository.interface.js';

/**
 * 流式进度管理器配置
 */
export interface StreamProgressConfig {
  /** 更新时间间隔（毫秒） */
  updateIntervalMs?: number;
  
  /** 更新字符数阈值 */
  updateCharThreshold?: number;
}

/**
 * 流式进度管理器
 * 负责批量更新策略，避免频繁写入 MongoDB
 */
export class StreamProgressManager {
  private repository: IStreamProgressRepository;
  private updateIntervalMs: number;
  private updateCharThreshold: number;

  // 跟踪最后更新状态
  private lastUpdateTime: number = 0;
  private lastUpdateLength: number = 0;

  constructor(
    repository: IStreamProgressRepository,
    config: StreamProgressConfig = {}
  ) {
    this.repository = repository;
    this.updateIntervalMs = config.updateIntervalMs || 1000; // 默认1秒
    this.updateCharThreshold = config.updateCharThreshold || 100; // 默认100字符
  }

  /**
   * 判断是否应该更新进度
   */
  private shouldUpdate(currentLength: number): boolean {
    const now = Date.now();
    const timeSinceUpdate = now - this.lastUpdateTime;
    const charsSinceUpdate = currentLength - this.lastUpdateLength;

    return (
      timeSinceUpdate >= this.updateIntervalMs ||
      charsSinceUpdate >= this.updateCharThreshold
    );
  }

  /**
   * 更新流式进度（带批量策略）
   * 
   * @param messageId 消息ID
   * @param accumulatedText 当前累积文本
   * @param metadata 额外元数据
   * @param force 是否强制更新（忽略批量策略）
   */
  async updateProgress(
    messageId: string,
    accumulatedText: string,
    metadata: {
      userId: string;
      conversationId: string;
      modelType: 'local' | 'volcano';
      thinking?: string;
      sources?: Array<{ title: string; url: string }>;
    },
    force: boolean = false
  ): Promise<boolean> {
    // 检查是否应该更新
    if (!force && !this.shouldUpdate(accumulatedText.length)) {
      return false; // 跳过更新
    }

    // 异步更新（不阻塞流）
    this.repository.upsert({
      messageId,
      accumulatedText,
      ...metadata,
    }).catch(error => {
      console.error('❌ [StreamProgress] 更新失败:', error);
    });

    // 更新最后更新状态
    this.lastUpdateTime = Date.now();
    this.lastUpdateLength = accumulatedText.length;

    return true; // 已触发更新
  }

  /**
   * 标记流式生成完成
   */
  async markCompleted(
    messageId: string,
    finalText: string,
    thinking?: string,
    sources?: Array<{ title: string; url: string }>
  ): Promise<void> {
    await this.repository.markCompleted(messageId, finalText, thinking, sources);
  }

  /**
   * 标记流式生成失败
   */
  async markError(messageId: string, error: string): Promise<void> {
    await this.repository.markError(messageId, error);
  }

  /**
   * 获取流式进度
   */
  async getProgress(messageId: string) {
    return await this.repository.findByMessageId(messageId);
  }

  /**
   * 清理流式进度记录
   */
  async cleanup(messageId: string): Promise<void> {
    await this.repository.delete(messageId);
  }

  /**
   * 重置批量更新状态（用于新会话）
   */
  reset(): void {
    this.lastUpdateTime = 0;
    this.lastUpdateLength = 0;
  }
}

