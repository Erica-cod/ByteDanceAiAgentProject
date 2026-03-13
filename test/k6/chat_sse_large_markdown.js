import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const ttfbTrend = new Trend('chat_ttfb_ms');
const totalTrend = new Trend('chat_total_ms');
const bodySizeTrend = new Trend('chat_response_body_bytes');
const status403Count = new Counter('chat_status_403_count');

const ORIGIN = __ENV.ORIGIN || 'http://localhost:8080';
const REFERER = __ENV.REFERER || `${ORIGIN}/`;

export const options = {
  vus: Number(__ENV.VUS || 2),
  iterations: Number(__ENV.ITERATIONS || 6),
  thresholds: {
    chat_ttfb_ms: ['p(95)<5000'],
    chat_total_ms: ['p(95)<120000'],
  },
};

function parseSizes() {
  const raw = (__ENV.CASE_SIZES || '5000,20000,100000').trim();
  return raw
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function buildMarkdown(chars, vu, iter) {
  const baseLine = `- [ ] 任务项（VU=${vu}, ITER=${iter}）: 评估输入与发送性能，观察 TTFB 与总耗时。\n`;
  let output = '# 基准测试输入\n\n';
  while (output.length < chars) {
    output += baseLine;
  }
  return output.slice(0, chars);
}

function getCsrf(baseUrl) {
  const res = http.get(`${baseUrl}/api/auth/csrf`, {
    headers: {
      Origin: ORIGIN,
      Referer: REFERER,
    },
    timeout: '30s',
  });

  const ok = check(res, {
    'csrf status is 200': (r) => r.status === 200,
  });
  if (!ok) {
    return null;
  }

  const body = res.json();
  return body?.data?.csrfToken || null;
}

export default function () {
  const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';
  const sizes = parseSizes();
  const idx = (__ITER + __VU) % sizes.length;
  const chars = sizes[idx];
  const markdown = buildMarkdown(chars, __VU, __ITER);
  const csrfToken = getCsrf(baseUrl);

  if (!csrfToken) {
    sleep(0.5);
    return;
  }

  const payload = JSON.stringify({
    message: markdown,
    modelType: __ENV.MODEL_TYPE || 'local',
    userId: `k6-large-${__VU}`,
    deviceId: `k6-large-device-${__VU}`,
    mode: 'single',
  });

  const maxAttempts = Number(__ENV.MAX_QUEUE_RETRY || 5);
  let attempt = 0;
  let queueToken = null;
  let res = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    const headers = {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
      Origin: ORIGIN,
      Referer: REFERER,
    };
    if (queueToken) {
      headers['X-Queue-Token'] = queueToken;
    }

    res = http.post(`${baseUrl}/api/chat`, payload, {
      headers,
      timeout: __ENV.TIMEOUT || '180s',
      tags: {
        case_chars: String(chars),
      },
    });

    if (res.status === 429) {
      queueToken = res.headers['X-Queue-Token'] || null;
      const retryAfterRaw = res.headers['Retry-After'];
      const retryAfterSec = retryAfterRaw ? Number.parseInt(String(retryAfterRaw), 10) : 1;
      sleep(Math.max(0.2, Number.isFinite(retryAfterSec) ? retryAfterSec : 1));
      continue;
    }

    break;
  }

  if (!res) {
    sleep(0.5);
    return;
  }

  if (res.status === 403) {
    status403Count.add(1);
  }

  check(res, {
    'chat status is 200 or 429': (r) => r.status === 200 || r.status === 429,
    'chat status is not 403': (r) => r.status !== 403,
  });

  ttfbTrend.add(res.timings.waiting, { case_chars: String(chars), status: String(res.status), attempts: String(attempt) });
  totalTrend.add(res.timings.duration, { case_chars: String(chars), status: String(res.status), attempts: String(attempt) });
  bodySizeTrend.add(res.body ? res.body.length : 0, { case_chars: String(chars), status: String(res.status), attempts: String(attempt) });

  sleep(Number(__ENV.SLEEP_SEC || 0.2));
}
