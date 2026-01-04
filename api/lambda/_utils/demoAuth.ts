/**
 * 演示用“弱登录”会话（Cookie Session）
 *
 * 设计目标：
 * - 不依赖企业 IdP（方便你本地演示：登录后解锁多 Agent）
 * - 后续可替换为真正的 OIDC（本文件的 API 尽量薄）
 *
 * ⚠️ 注意：
 * - 这是“演示版”，默认使用进程内内存存储；重启服务会丢失会话
 * - 生产环境建议替换为 Redis/数据库 + OIDC
 */

import { randomUUID } from 'crypto';

export type DemoAuthUser = {
  userId: string;
  username: string;
};

type SessionRecord = {
  sid: string;
  user: DemoAuthUser;
  createdAt: number;
  expiresAt: number;
};

const COOKIE_NAME = 'demo_sid';
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000; // 7 天

// 进程内会话存储（演示版）
const sessions = new Map<string, SessionRecord>();

function now() {
  return Date.now();
}

function cleanupExpiredSessions() {
  const ts = now();
  for (const [sid, rec] of sessions.entries()) {
    if (rec.expiresAt <= ts) sessions.delete(sid);
  }
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  const parts = cookieHeader.split(';');
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function isHttps(headers?: Record<string, any>) {
  const proto = String(headers?.['x-forwarded-proto'] || headers?.['X-Forwarded-Proto'] || '').toLowerCase();
  if (proto) return proto === 'https';
  return process.env.NODE_ENV === 'production';
}

export function buildSetSessionCookie(sid: string, headers?: Record<string, any>): string {
  const secure = isHttps(headers);
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(sid)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    // 注意：本地 http 开发环境不能强制 Secure，否则浏览器不存 Cookie
    ...(secure ? ['Secure'] : []),
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  return attrs.join('; ');
}

export function buildClearSessionCookie(headers?: Record<string, any>): string {
  const secure = isHttps(headers);
  const attrs = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
    'Max-Age=0',
  ];
  return attrs.join('; ');
}

export function createDemoSession(username?: string): SessionRecord {
  cleanupExpiredSessions();

  const safeName = (username || 'demo').trim().slice(0, 32) || 'demo';
  const sid = randomUUID();

  const rec: SessionRecord = {
    sid,
    user: {
      userId: `sub_${sid.slice(0, 8)}`,
      username: safeName,
    },
    createdAt: now(),
    expiresAt: now() + SESSION_TTL_MS,
  };

  sessions.set(sid, rec);
  return rec;
}

export function getDemoSessionFromHeaders(headers?: Record<string, any>): SessionRecord | null {
  cleanupExpiredSessions();
  const cookieHeader = headers?.cookie || headers?.Cookie;
  const cookies = parseCookies(cookieHeader);
  const sid = cookies[COOKIE_NAME];
  if (!sid) return null;
  const rec = sessions.get(sid);
  if (!rec) return null;
  if (rec.expiresAt <= now()) {
    sessions.delete(sid);
    return null;
  }
  return rec;
}

export function destroyDemoSessionFromHeaders(headers?: Record<string, any>): void {
  cleanupExpiredSessions();
  const cookieHeader = headers?.cookie || headers?.Cookie;
  const cookies = parseCookies(cookieHeader);
  const sid = cookies[COOKIE_NAME];
  if (sid) sessions.delete(sid);
}


