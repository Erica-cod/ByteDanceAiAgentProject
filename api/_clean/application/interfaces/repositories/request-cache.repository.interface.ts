/**
 * 请求缓存仓库接口
 * 
 * 定义缓存的持久化操作
 */

import type { RequestCacheEntity } from '../../../domain/entities/request-cache.entity.js';

export interface IRequestCacheRepository {
  /**
   * 保存请求缓存
   * 
   * @param cache - 缓存实体（不包含 cacheId）
   * @returns 保存后的完整缓存实体（包含 cacheId）
   */
  save(cache: Omit<RequestCacheEntity, 'cacheId'>): Promise<RequestCacheEntity>;

  /**
   * 根据 cacheId 查询缓存
   * 
   * @param cacheId - 缓存ID
   * @returns 缓存实体，如果不存在返回 null
   */
  findById(cacheId: string): Promise<RequestCacheEntity | null>;

  /**
   * 查询用户的所有有效缓存（用于相似度匹配）
   * 
   * @param userId - 用户ID
   * @param modelType - 模型类型（可选，如果提供则只返回该模型的缓存）
   * @param mode - 请求模式（可选）
   * @returns 缓存列表
   */
  findByUser(
    userId: string,
    modelType?: 'local' | 'volcano',
    mode?: 'single' | 'multi_agent' | 'chunking'
  ): Promise<RequestCacheEntity[]>;

  /**
   * 更新缓存命中信息
   * 
   * @param cacheId - 缓存ID
   * @returns 是否更新成功
   */
  updateHit(cacheId: string): Promise<boolean>;

  /**
   * 删除过期缓存（清理任务）
   * 
   * @returns 删除的缓存数量
   */
  deleteExpired(): Promise<number>;

  /**
   * 删除指定缓存
   * 
   * @param cacheId - 缓存ID
   * @returns 是否删除成功
   */
  delete(cacheId: string): Promise<boolean>;

  /**
   * 获取用户的缓存统计信息
   * 
   * @param userId - 用户ID
   * @returns 统计信息
   */
  getStats(userId: string): Promise<{
    totalCaches: number;
    totalHits: number;
    avgHitCount: number;
    oldestCache: Date | null;
    newestCache: Date | null;
  }>;

  /**
   * 确保 TTL 索引和向量搜索索引存在
   */
  ensureIndexes(): Promise<void>;
}

