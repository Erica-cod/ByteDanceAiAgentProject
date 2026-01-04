import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * k6 限流/队列压测：
 * - 通过并发压 /api/chat，观察 429 + Retry-After + X-Queue-* 头是否出现
 *
 * 运行前建议：
 * - 启动服务时把 MAX_SSE_CONNECTIONS 设小一点（例如 2），更容易稳定触发队列：
 *   MAX_SSE_CONNECTIONS=2 MAX_SSE_CONNECTIONS_PER_USER=1 npm run dev
 *
 * 执行：
 * - BASE_URL=http://localhost:3000 npm run load:k6:chat:queue
 */

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || '20s',
};

export default function () {
  const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}/api/chat`;

  const payload = JSON.stringify({
    message: 'k6 queue test - please stream',
    modelType: 'local',
    userId: `k6-user-${__VU}`,
    deviceId: `k6-device-${__VU}`,
    mode: 'single',
  });

  const res = http.post(url, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '120s',
  });

  const ok = check(res, {
    'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
  });

  if (ok && res.status === 429) {
    check(res, {
      'has Retry-After': (r) => !!r.headers['Retry-After'],
      'has X-Queue-Token': (r) => !!r.headers['X-Queue-Token'],
      'has X-Queue-Position (optional)': (r) =>
        r.headers['X-Queue-Position'] === undefined || String(r.headers['X-Queue-Position']).length > 0,
    });
  }

  sleep(0.2);
}


