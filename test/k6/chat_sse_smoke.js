import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 1,
  duration: '10s',
};

/**
 * k6 冒烟测试：/api/chat 能返回 200 或 429，并包含关键响应头（便于后续扩展）
 *
 * 注意：
 * - /api/chat 是 SSE 流式接口，响应会持续一段时间；本脚本只做“可用性”验证。
 */
export default function () {
  const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}/api/chat`;

  const payload = JSON.stringify({
    message: 'k6 smoke test',
    modelType: 'local',
    userId: `k6-user-${__VU}`,
    deviceId: `k6-device-${__VU}`,
    mode: 'single',
  });

  const res = http.post(url, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '60s',
  });

  check(res, {
    'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
  });

  // 429 的队列头校验（不强制，因为是否触发取决于当前并发）
  if (res.status === 429) {
    check(res, {
      'has Retry-After': (r) => !!r.headers['Retry-After'],
      'has X-Queue-Token': (r) => !!r.headers['X-Queue-Token'],
    });
  }

  sleep(1);
}


