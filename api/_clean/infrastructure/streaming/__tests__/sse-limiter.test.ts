/**
 * SSE 限流器 - 单元测试
 *
 * 说明：
 * - 只测试“不走队列”的分支（单用户并发上限），避免依赖 queue-manager 的全局状态
 */

import { jest } from '@jest/globals';

describe('acquireSSESlot', () => {
  beforeEach(() => {
    delete process.env.MAX_SSE_CONNECTIONS;
    delete process.env.MAX_SSE_CONNECTIONS_PER_USER;
  });

  test('单用户并发超限：应返回 ok=false 且不给队列位置', async () => {
    process.env.MAX_SSE_CONNECTIONS = '200';
    process.env.MAX_SSE_CONNECTIONS_PER_USER = '1';

    jest.resetModules();
    const { acquireSSESlot } = await import('../sse-limiter.js');

    const r1 = acquireSSESlot('u1');
    expect(r1.ok).toBe(true);
    if (r1.ok) r1.release();

    // 先占位不释放，再次申请触发“单用户上限”
    const hold = acquireSSESlot('u1');
    expect(hold.ok).toBe(true);

    const r2 = acquireSSESlot('u1');
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.reason).toContain('你已有正在生成中的对话');
      expect(r2.queuePosition).toBe(0);
      expect(r2.retryAfterSec).toBeGreaterThan(0);
      expect(typeof r2.queueToken).toBe('string');
    }

    if (hold.ok) hold.release();
  });
});


