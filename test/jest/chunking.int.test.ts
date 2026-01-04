/**
 * 超长文本 Chunking - 集成测试（可选，较慢）
 *
 * 依赖：
 * - 本地服务已启动（默认 http://localhost:8080）
 *
 * 说明：
 * - 默认跳过：需要显式设置 RUN_CHUNKING_TEST=1 才执行
 * - 只验证：接口可用并返回 SSE（200）或队列（429）
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

function generateLongText() {
  return Array.from({ length: 2000 }, (_, i) => `line-${i}: 这是一些用于 chunking 的测试内容。`).join('\n');
}

describe('chunking integration (optional)', () => {
  jest.setTimeout(180_000);

  test('超长文本请求：应返回 200(SSE) 或 429(队列)', async () => {
    if (process.env.RUN_CHUNKING_TEST !== '1') {
      // eslint-disable-next-line no-console
      console.warn('未设置 RUN_CHUNKING_TEST=1，跳过 chunking 集成测试');
      return;
    }

    const baseUrl = getBaseUrl();
    const reachable = await canReachServer(baseUrl);
    if (!reachable) {
      // eslint-disable-next-line no-console
      console.warn(`服务不可达，跳过 chunking 集成测试：${baseUrl}`);
      return;
    }

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: generateLongText(),
          modelType: 'local',
          userId: `jest_user_chunk_${Date.now()}`,
          mode: 'single',
          longTextMode: 'plan_review',
          longTextOptions: { preferChunking: true, maxChunks: 10, includeCitations: false },
        }),
        signal: controller.signal,
      });

      expect([200, 429]).toContain(res.status);
      if (res.status === 200) {
        // SSE 响应头校验
        expect(res.headers.get('content-type') || '').toContain('text/event-stream');
      }
    } finally {
      clearTimeout(t);
    }
  });
});


