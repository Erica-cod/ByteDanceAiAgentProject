/**
 * LRU 功能 - 集成测试（可选，较慢）
 *
 * 依赖：
 * - 本地服务已启动（默认 http://localhost:8080）
 * - MongoDB 可用
 *
 * 说明：
 * - 默认跳过：需要显式设置 RUN_LRU_TEST=1 才执行（避免每次跑测试都创建大量数据）
 */

import { jest } from '@jest/globals';

function getBaseUrl() {
  return process.env.API_URL || process.env.BASE_URL || 'http://localhost:8080';
}

async function canReachServer(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/chat`, { method: 'OPTIONS' });
    return res.status >= 200 && res.status < 600;
  } catch {
    return false;
  }
}

describe('LRU integration (optional)', () => {
  jest.setTimeout(180_000);

  test('创建超限对话后应出现归档，并可触发清理任务', async () => {
    if (process.env.RUN_LRU_TEST !== '1') {
      // eslint-disable-next-line no-console
      console.warn('未设置 RUN_LRU_TEST=1，跳过 LRU 集成测试');
      return;
    }

    const baseUrl = getBaseUrl();
    const reachable = await canReachServer(baseUrl);
    if (!reachable) {
      // eslint-disable-next-line no-console
      console.warn(`服务不可达，跳过 LRU 集成测试：${baseUrl}`);
      return;
    }

    const userId = `jest_user_lru_${Date.now()}`;

    // 1) 创建 51 个对话（默认限制 50）
    for (let i = 0; i < 51; i++) {
      const res = await fetch(`${baseUrl}/api/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, title: `测试对话 ${i + 1}` }),
      });
      const json: any = await res.json();
      expect(json.success).toBe(true);
    }

    // 2) 查询活跃对话
    const activeRes = await fetch(`${baseUrl}/api/conversations?userId=${userId}&limit=100`);
    const activeJson: any = await activeRes.json();
    expect(activeJson.success).toBe(true);
    expect(activeJson.data.total).toBeLessThanOrEqual(50);

    // 3) 查询归档对话
    const archRes = await fetch(`${baseUrl}/api/conversations/archived?userId=${userId}&limit=100`);
    const archJson: any = await archRes.json();
    expect(archJson.success).toBe(true);
    expect(archJson.data.total).toBeGreaterThanOrEqual(1);

    // 4) 触发一次清理任务（确保 admin 端点可用）
    const triggerRes = await fetch(`${baseUrl}/api/admin/lru-status/trigger`, { method: 'POST' });
    const triggerJson: any = await triggerRes.json();
    expect(triggerJson.success).toBe(true);
  });
});


