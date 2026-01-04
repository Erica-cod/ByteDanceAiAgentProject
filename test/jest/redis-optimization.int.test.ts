/**
 * Redis 压缩/读写/滑动 TTL - 集成测试（不依赖服务端）
 *
 * 目标：
 * - 验证 gzip 压缩显著降低体积
 * - 验证 Redis 能存 Buffer，并能 getBuffer 取回
 * - 验证 expire 续期行为
 */

import { jest } from '@jest/globals';

function generateMockState(round = 3) {
  return {
    completedRounds: round,
    sessionState: {
      status: 'running',
      current_round: round,
      text: '这是一段很长的文本内容。'.repeat(200),
    },
    userQuery: '这是用户的问题，请帮我分析一下如何实现一个复杂的 AI 系统。',
    timestamp: Date.now(),
    version: 1,
  };
}

describe('redis optimization integration', () => {
  jest.setTimeout(60_000);

  test('compressData should reduce size and redis can store buffers', async () => {
    const {
      isRedisAvailable,
      getRedisClient,
      closeRedisClient,
    } = await import('../../api/_clean/infrastructure/cache/redis-client.js');
    const { compressData, decompressData, resetRedisMetrics, getRedisMetrics } = await import(
      '../../api/_clean/infrastructure/cache/redis-utils.js'
    );

    const ok = await isRedisAvailable();
    if (!ok) {
      // eslint-disable-next-line no-console
      console.warn('Redis 不可用，跳过 redis-optimization 集成测试');
      return;
    }

    resetRedisMetrics();

    const client = getRedisClient();
    const state = generateMockState(3);
    const json = JSON.stringify(state);
    const rawSize = Buffer.from(json, 'utf-8').length;

    const compressed = await compressData(json);
    expect(compressed.length).toBeLessThan(rawSize);

    // 压缩率应该有明显收益（这里宽松一点）
    const ratio = 1 - compressed.length / rawSize;
    expect(ratio).toBeGreaterThan(0.3);

    const key = `test:redis:opt:${Date.now()}`;
    await client.setex(key, 10, compressed);

    const buf = await client.getBuffer(key);
    expect(buf).toBeTruthy();

    const restored = await decompressData(buf!);
    expect(restored).toBe(json);

    // 滑动 TTL：续期后 TTL 应回升
    const ttl1 = await client.ttl(key);
    expect(ttl1).toBeGreaterThan(0);
    await client.expire(key, 10);
    const ttl2 = await client.ttl(key);
    expect(ttl2).toBeGreaterThanOrEqual(ttl1);

    await client.del(key);

    const metrics = getRedisMetrics();
    expect(metrics.totalCompressedSize).toBeGreaterThan(0);
    expect(metrics.totalUncompressedSize).toBeGreaterThan(0);

    await closeRedisClient();
  });
});


