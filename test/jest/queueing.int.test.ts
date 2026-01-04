/**
 * 队列化（429 + Retry-After + X-Queue-Token）- 集成测试
 *
 * 依赖：
 * - 本地服务已启动（默认 http://localhost:8080）
 *
 * 说明：
 * - 这是“可选集成测试”：如果服务不可达，会自动跳过
 */

import { jest } from '@jest/globals';

function getBaseUrl() {
  return process.env.API_URL || process.env.BASE_URL || 'http://localhost:8080';
}

async function canReachServer(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/chat`, { method: 'OPTIONS' });
    // 只要不是网络错误就算可达（OPTIONS 可能返回 200/204/404，看实现）
    return res.status >= 200 && res.status < 600;
  } catch {
    return false;
  }
}

describe('queueing integration', () => {
  jest.setTimeout(60_000);

  test('并发请求：应返回 200 或 429；429 时应带队列头', async () => {
    const baseUrl = getBaseUrl();
    const reachable = await canReachServer(baseUrl);
    if (!reachable) {
      // eslint-disable-next-line no-console
      console.warn(`服务不可达，跳过队列集成测试：${baseUrl}`);
      return;
    }

    const userId = `jest_user_queue_${Date.now()}`;

    async function send(message: string, queueToken?: string | null) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 15_000);
      try {
        const body: any = {
          message,
          modelType: 'local',
          userId,
          mode: 'single',
          clientUserMessageId: `msg_${Date.now()}_${Math.random()}`,
          clientAssistantMessageId: `asst_${Date.now()}_${Math.random()}`,
        };
        if (queueToken) body.queueToken = queueToken;

        const res = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        // 不阻塞读完整 SSE（测试目标是校验队列头）
        if (res.status === 429) {
          return {
            status: 429,
            retryAfter: res.headers.get('Retry-After'),
            queueToken: res.headers.get('X-Queue-Token'),
            queuePosition: res.headers.get('X-Queue-Position'),
          };
        }

        return { status: res.status };
      } finally {
        clearTimeout(t);
      }
    }

    // 快速并发 3 个请求（通常会触发单用户 maxPerUser=1）
    const results = await Promise.all([send('msg1'), send('msg2'), send('msg3')]);

    // 至少应全部是 200 或 429
    results.forEach((r) => {
      expect([200, 429]).toContain(r.status);
    });

    const queued = results.find((r: any) => r.status === 429) as any;
    if (queued) {
      expect(queued.retryAfter).toBeTruthy();
      expect(queued.queueToken).toBeTruthy();
    }
  });
});


