/**
 * 多 Agent Redis 状态缓存 - 集成测试（不依赖服务端）
 *
 * 覆盖点：
 * - saveMultiAgentState / loadMultiAgentState / deleteMultiAgentState
 * - gzip 压缩存储 + metaKey
 * - 读取时滑动续期（renew TTL）
 */

import { jest } from '@jest/globals';

describe('redis multi-agent cache integration', () => {
  jest.setTimeout(60_000);

  test('save -> load (renew TTL) -> delete', async () => {
    const {
      isRedisAvailable,
      getRedisClient,
      closeRedisClient,
      saveMultiAgentState,
      loadMultiAgentState,
      deleteMultiAgentState,
    } = await import('../../api/_clean/infrastructure/cache/redis-client.js');

    const ok = await isRedisAvailable();
    if (!ok) {
      // eslint-disable-next-line no-console
      console.warn('Redis 不可用，跳过 multi-agent cache 集成测试');
      return;
    }

    const client = getRedisClient();
    const conversationId = `conv_${Date.now()}`;
    const assistantMessageId = `asst_${Date.now()}`;
    const userId = `u_${Date.now()}`;

    const saved = await saveMultiAgentState(
      client,
      conversationId,
      assistantMessageId,
      userId,
      {
        completedRounds: 2,
        sessionState: { current_round: 2, max_rounds: 5, status: 'in_progress' },
        userQuery: 'test query',
      },
      { maxRounds: 5, async: false }
    );
    expect(saved).toBe(true);

    const key = `multi_agent:${conversationId}:${assistantMessageId}`;
    const metaKey = `${key}:meta`;

    // 断言 key 存在
    const raw = await client.getBuffer(key);
    expect(raw).toBeTruthy();
    const meta = await client.get(metaKey);
    expect(meta).toBeTruthy();

    const beforeTTL = await client.ttl(key);
    expect(beforeTTL).toBeGreaterThan(0);

    const state = await loadMultiAgentState(client, conversationId, assistantMessageId, {
      renewTTL: true,
      maxRounds: 5,
    });
    expect(state).toBeTruthy();
    if (state) {
      expect(state.completedRounds).toBe(2);
      expect(state.userId).toBe(userId);
      expect(state.conversationId).toBe(conversationId);
    }

    const afterTTL = await client.ttl(key);
    // renew 后 TTL 应该被刷新到一个较大的值（动态 TTL 约 360s），这里做区间判断避免抖动
    expect(afterTTL).toBeGreaterThanOrEqual(200);
    expect(afterTTL).toBeLessThanOrEqual(360);

    const deleted = await deleteMultiAgentState(client, conversationId, assistantMessageId, userId);
    expect(deleted).toBe(true);

    await closeRedisClient();
  });
});


