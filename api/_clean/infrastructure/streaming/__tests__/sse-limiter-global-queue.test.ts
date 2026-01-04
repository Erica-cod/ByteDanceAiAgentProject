/**
 * SSE limiter（acquireSSESlot）- 全局队列化单元测试
 *
 * 目标：
 * - 达到 MAX_SSE_CONNECTIONS 后，新的用户应进入队列（429 分支的结果结构）
 * - 携带 queueToken 重试应保持队列位置
 */

import { jest } from '@jest/globals';

describe('sse-limiter global queueing', () => {
  beforeEach(() => {
    process.env.MAX_SSE_CONNECTIONS = '2';
    process.env.MAX_SSE_CONNECTIONS_PER_USER = '10'; // 避免单用户上限干扰
  });

  afterEach(() => {
    delete process.env.MAX_SSE_CONNECTIONS;
    delete process.env.MAX_SSE_CONNECTIONS_PER_USER;
  });

  test('超过全局上限：应返回 ok=false + queueToken/position/retryAfter', async () => {
    jest.resetModules();
    const { acquireSSESlot } = await import('../sse-limiter.js');

    const s1 = acquireSSESlot('u1');
    const s2 = acquireSSESlot('u2');
    expect(s1.ok).toBe(true);
    expect(s2.ok).toBe(true);

    const q1 = acquireSSESlot('u3');
    expect(q1.ok).toBe(false);
    if (q1.ok) return;
    expect(q1.reason).toContain('服务端繁忙');
    expect(q1.queuePosition).toBeGreaterThanOrEqual(0);
    expect(q1.retryAfterSec).toBeGreaterThan(0);
    expect(typeof q1.queueToken).toBe('string');

    // 携带 token 重试：应保持位置（或更靠前），并仍返回 429 分支
    const q2 = acquireSSESlot('u3', q1.queueToken);
    expect(q2.ok).toBe(false);
    if (q2.ok) return;
    expect(q2.queueToken).toBe(q1.queueToken);
    expect(q2.queuePosition).toBeLessThanOrEqual(q1.queuePosition);

    // 释放一个名额后，用同 token 再次尝试，应成功获得名额并从队列移除
    if (s1.ok) s1.release();
    const s3 = acquireSSESlot('u3', q1.queueToken);
    expect(s3.ok).toBe(true);
    if (s3.ok) s3.release();

    if (s2.ok) s2.release();
  });
});


