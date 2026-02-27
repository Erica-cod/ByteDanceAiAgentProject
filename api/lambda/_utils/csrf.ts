/**
 * CSRF 防护（Session-Bound）+ Origin/Referer 校验
 *
 * 设计目标：
 * - 浏览器只拿到 csrfToken 字符串（通过 /api/auth/csrf 获取）
 * - 服务端把 csrfToken 存在 Redis，cookie 只保存 csrf session id（HttpOnly）
 * - 所有写接口（POST/PUT/PATCH/DELETE）校验：
 *   1) Origin/Referer 必须可信
 *   2) X-CSRF-Token 必须等于 Redis 中该 csrfSid 对应的 token
 *
 * 说明：
 * - 测试环境（NODE_ENV=test）默认跳过，避免影响 Jest E2E（生产/开发不跳过）
 */

import '../../config/env.js';
import { randomBytes } from 'crypto';
import type Redis from 'ioredis';
import { getRedisClient } from '../../_clean/infrastructure/cache/redis-client.js';
import { parseCookies } from './bffOidcAuth.js';

const CSRF_TTL_SEC = 12 * 60 * 60; // 12小时（可按需调整）

export type CsrfCheckOk = { ok: true };
export type CsrfCheckFail = { ok: false; status: number; message: string };
export type CsrfCheckResult = CsrfCheckOk | CsrfCheckFail;

function redis(): Redis {
  return getRedisClient();
}

function base64url(input: Buffer) {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function isHttps(headers?: Record<string, any>) {
  const proto = String(headers?.['x-forwarded-proto'] || headers?.['X-Forwarded-Proto'] || '').toLowerCase();
  if (proto) return proto === 'https';
  return process.env.NODE_ENV === 'production';
}

function csrfCookieName(headers?: Record<string, any>) {
  // __Host- 前缀要求 Secure；本地 http 开发环境用普通名
  return isHttps(headers) ? '__Host-bff_csrf_sid' : 'bff_csrf_sid';
}

function csrfKey(csrfSid: string) {
  return `bff:csrf:${csrfSid}`;
}

export function buildSetCsrfSidCookie(csrfSid: string, headers?: Record<string, any>) {
  const secure = isHttps(headers);
  const attrs = [
    `${csrfCookieName(headers)}=${encodeURIComponent(csrfSid)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
    `Max-Age=${CSRF_TTL_SEC}`,
  ];
  return attrs.join('; ');
}

export function buildClearCsrfSidCookie(headers?: Record<string, any>) {
  const secure = isHttps(headers);
  const attrs = [
    `${csrfCookieName(headers)}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
    'Max-Age=0',
  ];
  return attrs.join('; ');
}

export function getCsrfSidFromHeaders(headers?: Record<string, any>) {
  const cookieHeader = headers?.cookie || headers?.Cookie;
  const cookies = parseCookies(cookieHeader);
  return cookies[csrfCookieName(headers)];
}

function guessSelfOrigin(headers?: Record<string, any>) {
  const host = headers?.host || headers?.Host;
  if (!host) return '';
  const scheme = isHttps(headers) ? 'https' : 'http';
  return `${scheme}://${host}`;
}

function allowedOrigins(headers?: Record<string, any>) {
  const env = String(process.env.CORS_ORIGIN || '').trim();
  if (env) {
    return env.split(',').map(s => s.trim()).filter(Boolean);
  }
  // 没配 CORS_ORIGIN：开发默认只放开本地；生产默认仅允许同源（由 Host 推断）
  if (process.env.NODE_ENV === 'development') {
    return ['http://localhost:8080', 'http://127.0.0.1:8080'];
  }
  const self = guessSelfOrigin(headers);
  return self ? [self] : [];
}

function originFromReferer(referer?: string) {
  if (!referer) return '';
  try {
    return new URL(referer).origin;
  } catch {
    return '';
  }
}

export function verifyOriginOrReferer(headers?: Record<string, any>): CsrfCheckResult {
  // 测试环境默认跳过，避免影响 E2E
  if (process.env.NODE_ENV === 'test') return { ok: true };

  const origin = String(headers?.origin || headers?.Origin || '');
  const referer = String(headers?.referer || headers?.Referer || '');

  const allowed = allowedOrigins(headers);

  // 优先校验 Origin（浏览器 fetch 通常会带）
  if (origin) {
    if (allowed.includes('*')) return { ok: true };
    if (allowed.includes(origin)) return { ok: true };
    return { ok: false, status: 403, message: `Origin 不被允许: ${origin}` };
  }

  // 没有 Origin 再用 Referer 兜底（部分场景会缺）
  const refOrigin = originFromReferer(referer);
  if (refOrigin) {
    if (allowed.includes('*')) return { ok: true };
    if (allowed.includes(refOrigin)) return { ok: true };
    return { ok: false, status: 403, message: `Referer 不被允许: ${refOrigin}` };
  }

  // 两者都没有：更像是非浏览器/异常请求
  return { ok: false, status: 403, message: '缺少 Origin/Referer，拒绝请求' };
}

export async function issueCsrfToken(headers?: Record<string, any>) {
  const existingSid = getCsrfSidFromHeaders(headers);
  const csrfSid = existingSid || base64url(randomBytes(18));

  const csrfToken = base64url(randomBytes(32));
  await redis().set(csrfKey(csrfSid), csrfToken, 'EX', CSRF_TTL_SEC);

  return {
    csrfSid,
    csrfToken,
    setCookie: existingSid ? undefined : buildSetCsrfSidCookie(csrfSid, headers),
  };
}

export async function requireCsrf(headers?: Record<string, any>): Promise<CsrfCheckResult> {
  // 测试环境默认跳过，避免影响 E2E
  if (process.env.NODE_ENV === 'test') return { ok: true };

  const o = verifyOriginOrReferer(headers);
  if (!o.ok) return o;

  const csrfSid = getCsrfSidFromHeaders(headers);
  if (!csrfSid) return { ok: false, status: 403, message: '缺少 CSRF 会话（请先访问 /api/auth/csrf）' };

  const headerToken = String(headers?.['x-csrf-token'] || headers?.['X-CSRF-Token'] || '').trim();
  if (!headerToken) return { ok: false, status: 403, message: '缺少 X-CSRF-Token' };

  const expected = await redis().get(csrfKey(csrfSid));
  if (!expected) return { ok: false, status: 403, message: 'CSRF token 过期（请刷新页面或重新获取）' };
  if (expected !== headerToken) return { ok: false, status: 403, message: 'CSRF token 不匹配' };

  return { ok: true };
}


