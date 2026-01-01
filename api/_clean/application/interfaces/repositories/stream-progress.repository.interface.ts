import { StreamProgress } from '../../../domain/entities/stream-progress.entity.js';

/**
 * 流式进度仓储接口
 */
export interface IStreamProgressRepository {
  /**
   * 创建或更新流式进度（upsert）
   * @param progress 进度数据
   */
  upsert(progress: Partial<StreamProgress> & { messageId: string }): Promise<void>;

  /**
   * 根据消息ID获取流式进度
   * @param messageId 消息ID
   */
  findByMessageId(messageId: string): Promise<StreamProgress | null>;

  /**
   * 标记流式生成完成
   * @param messageId 消息ID
   * @param finalText 最终完整文本
   * @param thinking 思考过程
   * @param sources 搜索来源
   */
  markCompleted(
    messageId: string,
    finalText: string,
    thinking?: string,
    sources?: Array<{ title: string; url: string }>
  ): Promise<void>;

  /**
   * 标记流式生成失败
   * @param messageId 消息ID
   * @param error 错误信息
   */
  markError(messageId: string, error: string): Promise<void>;

  /**
   * 删除流式进度记录
   * @param messageId 消息ID
   */
  delete(messageId: string): Promise<void>;

  /**
   * 确保索引存在（包括 TTL 索引）
   */
  ensureIndexes(): Promise<void>;
}

