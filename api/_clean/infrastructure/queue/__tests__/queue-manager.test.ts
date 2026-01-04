/**
 * QueueManager（内存队列）- 单元测试
 *
 * 覆盖点：
 * - token 复用（保持队列位置）
 * - 无效 token 惩罚（10 秒窗口内 3 次 → 30 秒冷却）
 */

import { jest } from '@jest/globals';

describe('queue-manager', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-04T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('已有 token：应返回相同 token 与稳定位置', async () => {
    jest.resetModules();
    const { enqueue } = await import('../queue-manager.js');

    const r1 = enqueue('u1');
    expect(r1.rejected).toBe(false);
    if (r1.rejected) return;
    expect(r1.position).toBe(0);

    // 复用 token 再入队，应返回同位置
    jest.advanceTimersByTime(1000);
    const r2 = enqueue('u1', r1.token);
    expect(r2.rejected).toBe(false);
    if (r2.rejected) return;
    expect(r2.token).toBe(r1.token);
    expect(r2.position).toBe(0);
  });

  test('无效 token：10 秒内 3 次应触发冷却', async () => {
    jest.resetModules();
    const { enqueue } = await import('../queue-manager.js');

    // 第一次无效 token：不会直接拒绝，但会记录无效行为并返回一个新 token
    const r1 = enqueue('u_bad', 'q_fake_1');
    expect(r1.rejected).toBe(false);

    // 第二次（仍在 10 秒窗口内）
    jest.advanceTimersByTime(500);
    const r2 = enqueue('u_bad', 'q_fake_2');
    expect(r2.rejected).toBe(false);

    // 第三次：达到阈值，触发冷却（rejected=true）
    jest.advanceTimersByTime(500);
    const r3 = enqueue('u_bad', 'q_fake_3');
    expect(r3.rejected).toBe(true);
    if (!r3.rejected) return;
    expect(r3.reason).toContain('频繁的无效请求');
    expect(r3.cooldownSec).toBeGreaterThanOrEqual(25);
    expect(r3.cooldownSec).toBeLessThanOrEqual(30);

    // 冷却期内再次尝试：应直接拒绝（剩余秒数递减）
    jest.advanceTimersByTime(1000);
    const r4 = enqueue('u_bad', 'q_fake_4');
    expect(r4.rejected).toBe(true);
    if (!r4.rejected) return;
    expect(r4.reason).toContain('异常请求模式');
    expect(r4.cooldownSec).toBeGreaterThan(0);
    expect(r4.cooldownSec).toBeLessThanOrEqual(30);
  });
});


