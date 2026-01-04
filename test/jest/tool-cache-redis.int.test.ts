/**
 * Tool Cache 写入 Redis - 集成测试（可选）
 *
 * 目标：
 * - 验证 CacheManager 在测试环境也能写入 Redis（通过 ALLOW_REDIS_IN_TEST=true 打开）
 * - 验证第二次调用命中缓存（fromCache=true）
 * - 验证 Redis 中存在 tool:cache:{toolName}:* key
 *
 * 开关：
 * - RUN_TOOL_CACHE_REDIS_TEST=1 才执行（默认跳过）
 */

import { jest } from '@jest/globals';

describe('tool cache redis integration (optional)', () => {
  jest.setTimeout(60_000);

  test('write + hit + key exists', async () => {
    if (process.env.RUN_TOOL_CACHE_REDIS_TEST !== '1') {
      // eslint-disable-next-line no-console
      console.warn('未设置 RUN_TOOL_CACHE_REDIS_TEST=1，跳过 tool cache redis 集成测试');
      return;
    }

    // 允许在 Jest 中启用 tool cache Redis
    process.env.ALLOW_REDIS_IN_TEST = 'true';

    // 动态导入：确保读取到最新 env
    const { toolRegistry } = await import('../../api/tools/v2/core/tool-registry.js');
    const { toolExecutor } = await import('../../api/tools/v2/core/tool-executor.js');
    const { cacheManager } = await import('../../api/tools/v2/core/cache-manager.js');
    const { getRedisClient, isRedisAvailable, closeRedisClient } = await import(
      '../../api/_clean/infrastructure/cache/redis-client.js'
    );

    const ok = await isRedisAvailable();
    if (!ok) {
      // eslint-disable-next-line no-console
      console.warn('Redis 不可用，跳过 tool cache redis 集成测试');
      return;
    }

    const toolName = `test_tool_cache_${Date.now()}`;

    toolRegistry.register({
      metadata: {
        name: toolName,
        description: '测试工具：返回固定数据，用于验证工具缓存写入 Redis',
        version: '0.0.1',
        author: 'test',
        enabled: true,
        tags: ['test'],
      },
      schema: {
        name: toolName,
        description: '测试工具：返回固定数据，用于验证工具缓存写入 Redis',
        parameters: {
          type: 'object',
          properties: {
            q: { type: 'string' },
          },
          required: ['q'],
        },
      },
      cache: {
        enabled: true,
        ttl: 60,
        keyStrategy: 'params',
      },
      execute: async (params: any) => {
        return { success: true, data: { echo: params.q, ts: Date.now() } };
      },
    } as any);

    // ToolRegistry.register 不会自动把 cache 配置塞进 CacheManager，这里手动配置
    cacheManager.setConfig(toolName, { enabled: true, ttl: 60, keyStrategy: 'params' });

    const ctx = { userId: 'u1', requestId: 'r1', timestamp: Date.now() };

    const r1 = await toolExecutor.execute(toolName, { q: 'hello' }, ctx, { skipRateLimit: true });
    expect(r1.success).toBe(true);
    expect(r1.fromCache).toBe(false);

    const r2 = await toolExecutor.execute(toolName, { q: 'hello' }, ctx, { skipRateLimit: true });
    expect(r2.success).toBe(true);
    expect(r2.fromCache).toBe(true);

    const redis = getRedisClient();
    const keys = await redis.keys(`tool:cache:${toolName}:*`);
    expect(keys.length).toBeGreaterThanOrEqual(1);

    // 清理
    await cacheManager.clear(toolName);
    toolRegistry.unregister(toolName);
    await closeRedisClient();
  });
});


