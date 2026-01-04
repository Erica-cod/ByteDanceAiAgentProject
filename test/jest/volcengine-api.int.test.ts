/**
 * 火山引擎（ARK）API 连通性测试（可选）
 *
 * 说明：
 * - 默认跳过，避免消耗配额
 * - 使用非 stream 请求，减少复杂度
 *
 * 开关：
 * - RUN_VOLCENGINE_API_TEST=1
 */

import { jest } from '@jest/globals';

describe('volcengine api (optional)', () => {
  jest.setTimeout(60_000);

  test('chat completions should return choices', async () => {
    if (process.env.RUN_VOLCENGINE_API_TEST !== '1') {
      // eslint-disable-next-line no-console
      console.warn('未设置 RUN_VOLCENGINE_API_TEST=1，跳过火山引擎 API 测试');
      return;
    }

    const apiKey = process.env.ARK_API_KEY;
    const apiUrl = process.env.ARK_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
    const model = process.env.ARK_MODEL || 'doubao-1-5-thinking-pro-250415';

    if (!apiKey) {
      // eslint-disable-next-line no-console
      console.warn('未配置 ARK_API_KEY，跳过火山引擎 API 测试');
      return;
    }

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是一个有帮助的AI助手。' },
          { role: 'user', content: '你好，请用一句话介绍你自己。' },
        ],
        stream: false,
        temperature: 0.2,
        max_tokens: 64,
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Volcengine API failed: ${res.status} ${res.statusText} - ${t.slice(0, 200)}`);
    }

    const json: any = await res.json();
    expect(Array.isArray(json.choices)).toBe(true);
    expect(json.choices.length).toBeGreaterThan(0);
  });
});


