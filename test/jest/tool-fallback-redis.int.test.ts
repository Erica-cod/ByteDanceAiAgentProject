/**
 * 工具降级链 + Redis 工具缓存 - 集成测试（可选，不依赖外部 API）
 *
 * 覆盖点：
 * - 先正常执行写入缓存（tool:cache:*）
 * - 人工触发熔断 open
 * - 使用 skipCache=true 让主流程不提前返回缓存，进入熔断分支并触发 fallbackChain
 * - fallbackChain 的 cache 策略应返回缓存，并标记 degraded=true
 *
 * 开关：
 * - RUN_TOOL_FALLBACK_REDIS_TEST=1 才执行
 * - ALLOW_REDIS_IN_TEST=true 允许 Jest 中启用 tool cache Redis
 */

import { jest } from '@jest/globals';

describe('tool fallback chain + redis cache (optional)', () => {
  jest.setTimeout(60_000);

  test('cache write -> circuit open -> fallback returns cache', async () => {
    if (process.env.RUN_TOOL_FALLBACK_REDIS_TEST !== '1') {
      // eslint-disable-next-line no-console
      console.warn('未设置 RUN_TOOL_FALLBACK_REDIS_TEST=1，跳过 tool fallback+redis 测试');
      return;
    }

    process.env.ALLOW_REDIS_IN_TEST = 'true';

    // 动态导入：确保读取到最新 env
    const { toolRegistry } = await import('../../api/tools/v2/core/tool-registry.js');
    const { toolExecutor } = await import('../../api/tools/v2/core/tool-executor.js');
    const { cacheManager } = await import('../../api/tools/v2/core/cache-manager.js');
    const { circuitBreaker } = await import('../../api/tools/v2/core/circuit-breaker.js');
    const { getRedisClient, isRedisAvailable, closeRedisClient } = await import(
      '../../api/_clean/infrastructure/cache/redis-client.js'
    );

    const redisOk = await isRedisAvailable();
    if (!redisOk) {
      // eslint-disable-next-line no-console
      console.warn('Redis 不可用，跳过 tool fallback+redis 测试');
      return;
    }

    const toolName = `test_fallback_${Date.now()}`;
    const ctx = { userId: 'u_fallback', requestId: 'r_fallback', timestamp: Date.now() };

    // 注册 dummy 工具：执行永远成功，但我们会用熔断来模拟“不可用”
    toolRegistry.register({
      metadata: {
        name: toolName,
        description: '测试工具：用于验证降级链（cache/stale/default）',
        version: '0.0.1',
        author: 'test',
        enabled: true,
        tags: ['test'],
      },
      schema: {
        name: toolName,
        description: '测试工具：用于验证降级链（cache/stale/default）',
        parameters: {
          type: 'object',
          properties: { q: { type: 'string' } },
          required: ['q'],
        },
      },
      cache: { enabled: true, ttl: 60, keyStrategy: 'params' },
      circuitBreaker: { enabled: true, failureThreshold: 2, resetTimeout: 30_000 },
      fallback: {
        enabled: true,
        fallbackChain: [{ type: 'cache' }, { type: 'stale-cache' }, { type: 'default' }],
        allowStaleCache: true,
        defaultResponse: { success: true, data: { degraded: true }, message: 'default fallback' },
      },
      execute: async (params: any) => {
        return { success: true, data: { echo: params.q, ts: Date.now() }, message: 'ok' };
      },
    } as any);

    // ToolRegistry.register 不会自动注入 CacheManager/CircuitBreaker，这里手动配置
    cacheManager.setConfig(toolName, { enabled: true, ttl: 60, keyStrategy: 'params' });
    circuitBreaker.setConfig(toolName, { enabled: true, failureThreshold: 2, resetTimeout: 30_000 });

    // 1) 正常执行一次，写入缓存
    const r1 = await toolExecutor.execute(toolName, { q: 'hello' }, ctx, { skipRateLimit: true });
    expect(r1.success).toBe(true);
    expect(r1.fromCache).toBe(false);

    const redis = getRedisClient();
    const keys1 = await redis.keys(`tool:cache:${toolName}:*`);
    expect(keys1.length).toBeGreaterThanOrEqual(1);

    // 2) 触发熔断 open（2 次失败）
    circuitBreaker.recordFailure(toolName);
    circuitBreaker.recordFailure(toolName);
    expect(circuitBreaker.canExecute(toolName).allowed).toBe(false);

    // 3) 走熔断分支并触发降级链：skipCache=true 避免主流程提前返回缓存
    const r2 = await toolExecutor.execute(toolName, { q: 'hello' }, ctx, {
      skipCache: true,
      skipRateLimit: true,
    });

    expect(r2.success).toBe(true);
    expect(r2.degraded).toBe(true);
    expect(r2.degradedBy).toBe('cache');
    expect(r2.fromCache).toBe(true);

    // 清理
    await cacheManager.clear(toolName);
    circuitBreaker.reset(toolName);
    toolRegistry.unregister(toolName);
    await closeRedisClient();
  });
});


