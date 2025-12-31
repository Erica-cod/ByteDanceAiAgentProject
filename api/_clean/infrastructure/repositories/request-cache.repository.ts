/**
 * 请求缓存仓库实现 (MongoDB)
 * 
 * 使用 MongoDB 存储请求缓存，支持 TTL 索引自动清理过期数据
 */

import { getDatabase } from '../../../db/connection.js';
import type { IRequestCacheRepository } from '../../application/interfaces/repositories/request-cache.repository.interface.js';
import type { RequestCacheEntity } from '../../domain/entities/request-cache.entity.js';
import { Collection, ObjectId } from 'mongodb';

/**
 * MongoDB 缓存文档结构
 */
interface CacheDocument {
  _id?: ObjectId;
  userId: string;
  requestText: string;
  requestEmbedding: number[];
  responseContent: string;
  responseThinking?: string;
  modelType: 'local' | 'volcano';
  mode: 'single' | 'multi_agent' | 'chunking';
  hitCount: number;
  lastHitAt?: Date;
  createdAt: Date;
  expiresAt: Date;
  metadata?: any;
}

export class MongoRequestCacheRepository implements IRequestCacheRepository {
  private readonly COLLECTION_NAME = 'request_caches';

  /**
   * 获取集合
   */
  private async getCollection(): Promise<Collection<CacheDocument>> {
    const db = await getDatabase();
    return db.collection<CacheDocument>(this.COLLECTION_NAME);
  }

  /**
   * 将 MongoDB 文档转换为实体
   */
  private toEntity(doc: CacheDocument): RequestCacheEntity {
    return {
      cacheId: doc._id!.toString(),
      userId: doc.userId,
      requestText: doc.requestText,
      requestEmbedding: doc.requestEmbedding,
      responseContent: doc.responseContent,
      responseThinking: doc.responseThinking,
      modelType: doc.modelType,
      mode: doc.mode,
      hitCount: doc.hitCount,
      lastHitAt: doc.lastHitAt,
      createdAt: doc.createdAt,
      expiresAt: doc.expiresAt,
      metadata: doc.metadata,
    };
  }

  /**
   * 保存请求缓存
   */
  async save(cache: Omit<RequestCacheEntity, 'cacheId'>): Promise<RequestCacheEntity> {
    const collection = await this.getCollection();

    const doc: CacheDocument = {
      userId: cache.userId,
      requestText: cache.requestText,
      requestEmbedding: cache.requestEmbedding,
      responseContent: cache.responseContent,
      responseThinking: cache.responseThinking,
      modelType: cache.modelType,
      mode: cache.mode || 'single',
      hitCount: cache.hitCount,
      lastHitAt: cache.lastHitAt,
      createdAt: cache.createdAt,
      expiresAt: cache.expiresAt,
      metadata: cache.metadata,
    };

    const result = await collection.insertOne(doc);
    
    console.log(`✅ [Cache] 已保存缓存: ${result.insertedId}`);

    return this.toEntity({ ...doc, _id: result.insertedId });
  }

  /**
   * 根据 cacheId 查询缓存
   */
  async findById(cacheId: string): Promise<RequestCacheEntity | null> {
    const collection = await this.getCollection();

    try {
      const doc = await collection.findOne({ _id: new ObjectId(cacheId) });
      
      if (!doc) {
        return null;
      }

      // 检查是否过期
      if (doc.expiresAt < new Date()) {
        console.log(`⚠️  [Cache] 缓存已过期: ${cacheId}`);
        return null;
      }

      return this.toEntity(doc);
    } catch (error) {
      console.error(`❌ [Cache] 查询缓存失败: ${cacheId}`, error);
      return null;
    }
  }

  /**
   * 查询用户的所有有效缓存
   */
  async findByUser(
    userId: string,
    modelType?: 'local' | 'volcano',
    mode?: 'single' | 'multi_agent' | 'chunking'
  ): Promise<RequestCacheEntity[]> {
    const collection = await this.getCollection();

    const filter: any = {
      userId,
      expiresAt: { $gt: new Date() }, // 只返回未过期的缓存
    };

    if (modelType) {
      filter.modelType = modelType;
    }

    if (mode) {
      filter.mode = mode;
    }

    const docs = await collection
      .find(filter)
      .sort({ createdAt: -1 }) // 最新的排在前面
      .limit(100) // 限制返回数量，避免数据过多
      .toArray();

    return docs.map(doc => this.toEntity(doc));
  }

  /**
   * 更新缓存命中信息
   */
  async updateHit(cacheId: string): Promise<boolean> {
    const collection = await this.getCollection();

    try {
      const result = await collection.updateOne(
        { _id: new ObjectId(cacheId) },
        {
          $inc: { hitCount: 1 },
          $set: { lastHitAt: new Date() },
        }
      );

      return result.modifiedCount > 0;
    } catch (error) {
      console.error(`❌ [Cache] 更新命中信息失败: ${cacheId}`, error);
      return false;
    }
  }

  /**
   * 删除过期缓存
   */
  async deleteExpired(): Promise<number> {
    const collection = await this.getCollection();

    try {
      const result = await collection.deleteMany({
        expiresAt: { $lt: new Date() },
      });

      if (result.deletedCount > 0) {
        console.log(`🗑️  [Cache] 已删除 ${result.deletedCount} 个过期缓存`);
      }

      return result.deletedCount;
    } catch (error) {
      console.error('❌ [Cache] 删除过期缓存失败:', error);
      return 0;
    }
  }

  /**
   * 删除指定缓存
   */
  async delete(cacheId: string): Promise<boolean> {
    const collection = await this.getCollection();

    try {
      const result = await collection.deleteOne({ _id: new ObjectId(cacheId) });
      return result.deletedCount > 0;
    } catch (error) {
      console.error(`❌ [Cache] 删除缓存失败: ${cacheId}`, error);
      return false;
    }
  }

  /**
   * 获取用户的缓存统计信息
   */
  async getStats(userId: string): Promise<{
    totalCaches: number;
    totalHits: number;
    avgHitCount: number;
    oldestCache: Date | null;
    newestCache: Date | null;
  }> {
    const collection = await this.getCollection();

    try {
      const caches = await collection
        .find({ userId, expiresAt: { $gt: new Date() } })
        .toArray();

      if (caches.length === 0) {
        return {
          totalCaches: 0,
          totalHits: 0,
          avgHitCount: 0,
          oldestCache: null,
          newestCache: null,
        };
      }

      const totalHits = caches.reduce((sum, cache) => sum + cache.hitCount, 0);
      const dates = caches.map(c => c.createdAt).sort((a, b) => a.getTime() - b.getTime());

      return {
        totalCaches: caches.length,
        totalHits,
        avgHitCount: totalHits / caches.length,
        oldestCache: dates[0],
        newestCache: dates[dates.length - 1],
      };
    } catch (error) {
      console.error('❌ [Cache] 获取统计信息失败:', error);
      return {
        totalCaches: 0,
        totalHits: 0,
        avgHitCount: 0,
        oldestCache: null,
        newestCache: null,
      };
    }
  }

  /**
   * 确保索引存在
   */
  async ensureIndexes(): Promise<void> {
    const collection = await this.getCollection();

    try {
      // 1. TTL 索引：自动删除过期文档
      await collection.createIndex(
        { expiresAt: 1 },
        { 
          name: 'ttl_index',
          expireAfterSeconds: 0, // 在 expiresAt 时间点自动删除
        }
      );

      // 2. 用户查询索引
      await collection.createIndex(
        { userId: 1, expiresAt: -1 },
        { name: 'user_expires_index' }
      );

      // 3. 模型类型索引
      await collection.createIndex(
        { userId: 1, modelType: 1, mode: 1, expiresAt: -1 },
        { name: 'user_model_mode_index' }
      );

      console.log('✅ [Cache] 索引创建完成');
    } catch (error) {
      console.error('❌ [Cache] 索引创建失败:', error);
    }
  }
}

