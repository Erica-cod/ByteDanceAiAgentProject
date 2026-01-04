/**
 * 用户提问缓存（Embedding Cache / Request Cache）- 集成测试（可选）
 *
 * 依赖：
 * - MongoDB 可用
 * - embedding/模型相关依赖可用（否则会自动跳过）
 */

import { jest } from '@jest/globals';

describe('request-cache integration (optional)', () => {
  jest.setTimeout(120_000);

  test('缓存服务可用时：save + find + stats 应正常', async () => {
    if (process.env.RUN_REQUEST_CACHE_TEST !== '1') {
      // eslint-disable-next-line no-console
      console.warn('未设置 RUN_REQUEST_CACHE_TEST=1，跳过 request-cache 集成测试');
      return;
    }

    // 动态导入：避免在未配置环境时直接初始化失败
    const { connectToDatabase, closeDatabase } = await import('../../api/db/connection.js');
    const { getContainer } = await import('../../api/_clean/di-container.js');
    const { requestCacheService } = await import(
      '../../api/_clean/infrastructure/cache/request-cache.service.js'
    );
    const { closeRedisClient } = await import('../../api/_clean/infrastructure/cache/redis-client.js');

    await connectToDatabase();
    const container = getContainer();
    await container.ensureRequestCacheIndexes();

    if (!requestCacheService.isAvailable()) {
      // eslint-disable-next-line no-console
      console.warn('requestCacheService 不可用（可能缺少 embedding/模型配置），跳过');
      await closeDatabase();
      return;
    }

    const userId = `jest_user_reqcache_${Date.now()}`;
    const req = '什么是人工智能？';
    const resp = '（测试）人工智能是计算机科学分支……';

    await requestCacheService.saveToCache(req, resp, userId, {
      modelType: 'volcano',
      mode: 'single',
      metadata: { testMode: true, timestamp: Date.now() },
      ttlDays: 1,
    });

    const hit = await requestCacheService.findCachedResponse(req, userId, {
      modelType: 'volcano',
      mode: 'single',
      similarityThreshold: 0.95,
    });

    expect(hit).toBeTruthy();
    if (hit) {
      expect(typeof hit.content).toBe('string');
      expect(hit.content.length).toBeGreaterThan(0);
    }

    const stats = await requestCacheService.getStats(userId);
    expect(stats.totalCaches).toBeGreaterThanOrEqual(1);

    // ✅ 优雅退出，避免 Jest open handles
    await closeRedisClient();
    await closeDatabase();
  });
});


