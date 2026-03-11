/**
 * 认证链路限流（Redis 主存 + 本地内存保险 + 轻量熔断）
 *
 * 设计目标：
 * - 优先使用 Redis 做全局一致限流
 * - Redis 异常时自动降级到进程内限流（防洪，不追求全局强一致）
 * - 不在请求关键路径上加全局锁，避免放大延迟
 */
import type Redis from 'ioredis';
import { getCorsHeaders } from './cors.js';
import { getRedisClient } from '../../_clean/infrastructure/cache/redis-client.js';

type AuthEndpoint = 'auth_login' | 'auth_callback' | 'auth_csrf';
type LimitMode = 'redis' | 'local';

interface LimitRule {
  name: string;
  max: number;
  windowSec: number;
  key: string;
}

interface ConsumeResult {
  allowed: boolean;
  retryAfterSec: number;
  mode: LimitMode;
  ruleName?: string;
}

interface AuthRateLimitInput {
  endpoint: AuthEndpoint;
  headers?: Record<string, string>;
  requestOrigin?: string;
  deviceIdHash?: string;
}

type CircuitState = 'closed' | 'open' | 'half_open';

const ENABLED = process.env.AUTH_RATE_LIMIT_ENABLED !== 'false';
const LOCAL_MAX_KEYS = parseInt(process.env.AUTH_RATE_LIMIT_LOCAL_MAX_KEYS || '100000', 10);
const OPEN_MS = parseInt(process.env.AUTH_RATE_LIMIT_OPEN_MS || '30000', 10);
const FAIL_THRESHOLD = parseInt(process.env.AUTH_RATE_LIMIT_FAIL_THRESHOLD || '8', 10);
const HALF_OPEN_SUCCESS_THRESHOLD = parseInt(process.env.AUTH_RATE_LIMIT_HALF_OPEN_SUCCESS_THRESHOLD || '5', 10);
const HALF_OPEN_PROBE_EVERY = parseInt(process.env.AUTH_RATE_LIMIT_HALF_OPEN_PROBE_EVERY || '10', 10);

let circuitState: CircuitState = 'closed';
let openUntil = 0;
let consecutiveFailures = 0;
let consecutiveHalfOpenSuccess = 0;
let halfOpenCounter = 0;

const localCounters = new Map<string, { count: number; expiresAt: number; lastAccess: number }>();

function parsePositiveInt(value: string | undefined, fallback: number) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function nowMs() {
  return Date.now();
}

function getClientIp(headers?: Record<string, string>): string {
  const h = headers || {};
  const forwardedFor = h['x-forwarded-for'] || h['X-Forwarded-For'] || '';
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = h['x-real-ip'] || h['X-Real-IP'];
  if (realIp) return String(realIp).trim();
  return 'unknown_ip';
}

function sanitizeKeyPart(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  return String(value).slice(0, 128);
}

function fixedWindowBucket(windowSec: number): number {
  return Math.floor(Math.floor(nowMs() / 1000) / windowSec);
}

function redisCounterKey(rule: LimitRule): string {
  const bucket = fixedWindowBucket(rule.windowSec);
  return `bff:ratelimit:${rule.name}:${rule.key}:${bucket}`;
}

function localCounterKey(rule: LimitRule): string {
  const bucket = fixedWindowBucket(rule.windowSec);
  return `${rule.name}:${rule.key}:${bucket}`;
}

function trimLocalCountersIfNeeded() {
  if (localCounters.size <= LOCAL_MAX_KEYS) return;

  const now = nowMs();
  for (const [k, v] of localCounters) {
    if (v.expiresAt <= now) localCounters.delete(k);
  }
  if (localCounters.size <= LOCAL_MAX_KEYS) return;

  // 退化 LRU：删除最旧的 10% 访问记录，保证内存有界
  const entries = [...localCounters.entries()].sort((a, b) => a[1].lastAccess - b[1].lastAccess);
  const removeCount = Math.max(1, Math.floor(entries.length * 0.1));
  for (let i = 0; i < removeCount; i += 1) {
    localCounters.delete(entries[i][0]);
  }
}

function consumeLocal(rule: LimitRule): ConsumeResult {
  const key = localCounterKey(rule);
  const now = nowMs();
  const expiresAt = now + rule.windowSec * 1000;
  const current = localCounters.get(key);
  if (!current || current.expiresAt <= now) {
    localCounters.set(key, { count: 1, expiresAt, lastAccess: now });
    trimLocalCountersIfNeeded();
    return { allowed: true, retryAfterSec: 0, mode: 'local' };
  }

  current.count += 1;
  current.lastAccess = now;
  localCounters.set(key, current);
  trimLocalCountersIfNeeded();

  if (current.count > rule.max) {
    const retryAfterSec = Math.max(1, Math.ceil((current.expiresAt - now) / 1000));
    return { allowed: false, retryAfterSec, mode: 'local', ruleName: rule.name };
  }

  return { allowed: true, retryAfterSec: 0, mode: 'local' };
}

async function consumeRedis(client: Redis, rule: LimitRule): Promise<ConsumeResult> {
  const key = redisCounterKey(rule);
  const count = await client.incr(key);
  if (count === 1) {
    await client.expire(key, rule.windowSec + 2);
  }

  if (count > rule.max) {
    const retryAfterSec = Math.max(1, rule.windowSec - (Math.floor(nowMs() / 1000) % rule.windowSec));
    return { allowed: false, retryAfterSec, mode: 'redis', ruleName: rule.name };
  }

  return { allowed: true, retryAfterSec: 0, mode: 'redis' };
}

function shouldTryRedis(): boolean {
  const now = nowMs();
  if (circuitState === 'open') {
    if (now < openUntil) return false;
    circuitState = 'half_open';
    consecutiveHalfOpenSuccess = 0;
    halfOpenCounter = 0;
  }

  if (circuitState === 'half_open') {
    halfOpenCounter += 1;
    return halfOpenCounter % HALF_OPEN_PROBE_EVERY === 1;
  }

  return true;
}

function onRedisSuccess() {
  consecutiveFailures = 0;
  if (circuitState === 'half_open') {
    consecutiveHalfOpenSuccess += 1;
    if (consecutiveHalfOpenSuccess >= HALF_OPEN_SUCCESS_THRESHOLD) {
      circuitState = 'closed';
      consecutiveHalfOpenSuccess = 0;
      halfOpenCounter = 0;
    }
  }
}

function onRedisFailure() {
  const now = nowMs();
  consecutiveFailures += 1;
  if (circuitState === 'half_open' || consecutiveFailures >= FAIL_THRESHOLD) {
    circuitState = 'open';
    openUntil = now + OPEN_MS;
    consecutiveHalfOpenSuccess = 0;
    halfOpenCounter = 0;
  }
}

function resolveRules(input: AuthRateLimitInput): LimitRule[] {
  const ip = sanitizeKeyPart(getClientIp(input.headers), 'unknown_ip');
  const device = sanitizeKeyPart(input.deviceIdHash, '');

  const rules: LimitRule[] = [];
  if (input.endpoint === 'auth_login') {
    rules.push({
      name: 'auth_login_ip',
      key: ip,
      max: parsePositiveInt(process.env.AUTH_LOGIN_IP_MAX, 1200),
      windowSec: parsePositiveInt(process.env.AUTH_LOGIN_IP_WINDOW_SEC, 60),
    });
    rules.push({
      name: 'auth_login_global',
      key: 'global',
      max: parsePositiveInt(process.env.AUTH_LOGIN_GLOBAL_MAX, 8000),
      windowSec: parsePositiveInt(process.env.AUTH_LOGIN_GLOBAL_WINDOW_SEC, 60),
    });
    if (device) {
      rules.push({
        name: 'auth_login_device',
        key: device,
        max: parsePositiveInt(process.env.AUTH_LOGIN_DEVICE_MAX, 20),
        windowSec: parsePositiveInt(process.env.AUTH_LOGIN_DEVICE_WINDOW_SEC, 300),
      });
    }
  } else if (input.endpoint === 'auth_callback') {
    rules.push({
      name: 'auth_callback_ip',
      key: ip,
      max: parsePositiveInt(process.env.AUTH_CALLBACK_IP_MAX, 600),
      windowSec: parsePositiveInt(process.env.AUTH_CALLBACK_IP_WINDOW_SEC, 60),
    });
    rules.push({
      name: 'auth_callback_global',
      key: 'global',
      max: parsePositiveInt(process.env.AUTH_CALLBACK_GLOBAL_MAX, 4000),
      windowSec: parsePositiveInt(process.env.AUTH_CALLBACK_GLOBAL_WINDOW_SEC, 60),
    });
  } else if (input.endpoint === 'auth_csrf') {
    rules.push({
      name: 'auth_csrf_ip',
      key: ip,
      max: parsePositiveInt(process.env.AUTH_CSRF_IP_MAX, 300),
      windowSec: parsePositiveInt(process.env.AUTH_CSRF_IP_WINDOW_SEC, 60),
    });
    rules.push({
      name: 'auth_csrf_global',
      key: 'global',
      max: parsePositiveInt(process.env.AUTH_CSRF_GLOBAL_MAX, 6000),
      windowSec: parsePositiveInt(process.env.AUTH_CSRF_GLOBAL_WINDOW_SEC, 60),
    });
  }

  return rules;
}

function toLimitResponse(
  requestOrigin: string | undefined,
  message: string,
  status: 429 | 503,
  retryAfterSec: number,
  reason: string,
  mode: LimitMode
): Response {
  const corsHeaders = getCorsHeaders(requestOrigin);
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': String(Math.max(1, retryAfterSec || 1)),
        'X-RateLimit-Reason': reason,
        'X-RateLimit-Mode': mode,
        ...corsHeaders,
      },
    }
  );
}

export async function enforceAuthRateLimit(input: AuthRateLimitInput): Promise<Response | null> {
  if (!ENABLED) return null;

  const rules = resolveRules(input);
  if (rules.length === 0) return null;

  const tryRedis = shouldTryRedis();
  if (!tryRedis) {
    for (const rule of rules) {
      const localRes = consumeLocal(rule);
      if (!localRes.allowed) {
        return toLimitResponse(
          input.requestOrigin,
          '请求过于频繁，请稍后重试',
          429,
          localRes.retryAfterSec,
          localRes.ruleName || rule.name,
          localRes.mode
        );
      }
    }
    return null;
  }

  try {
    const client = getRedisClient();
    for (const rule of rules) {
      const redisRes = await consumeRedis(client, rule);
      if (!redisRes.allowed) {
        onRedisSuccess();
        return toLimitResponse(
          input.requestOrigin,
          '请求过于频繁，请稍后重试',
          429,
          redisRes.retryAfterSec,
          redisRes.ruleName || rule.name,
          redisRes.mode
        );
      }
    }
    onRedisSuccess();
    return null;
  } catch (error) {
    onRedisFailure();
    // Redis 异常时降级到本地限流，不直接放开
    for (const rule of rules) {
      const localRes = consumeLocal(rule);
      if (!localRes.allowed) {
        return toLimitResponse(
          input.requestOrigin,
          '请求过于频繁，请稍后重试',
          429,
          localRes.retryAfterSec,
          localRes.ruleName || rule.name,
          localRes.mode
        );
      }
    }

    // 记录一次轻量告警，避免吞错无感知
    console.warn('[AuthRateLimit] Redis 限流降级到本地模式:', (error as Error)?.message || error);
    return null;
  }
}

export function buildAuthStoreUnavailableResponse(requestOrigin?: string): Response {
  return toLimitResponse(
    requestOrigin,
    '认证服务暂时不可用，请稍后重试',
    503,
    3,
    'auth_store_unavailable',
    circuitState === 'open' ? 'local' : 'redis'
  );
}

