/**
 * BFF OIDC 登录（授权码 + PKCE）工具
 * - Redis 存 state/nonce/code_verifier（短期）
 * - Redis 存 BFF session（中期）
 * - 回调使用 jose 校验 id_token（签名/JWKS + iss/aud/exp/nonce）
 */

import '../../config/env.js';
import { randomBytes, createHash, randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { getRedisClient } from '../../_clean/infrastructure/cache/redis-client.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export type BffUser = {
  sub: string;
  username?: string;
  name?: string;
};

export type BffSession = {
  sid: string;
  user: BffUser;
  createdAt: number;
  expiresAt: number;
  tokens: {
    access_token: string;
    refresh_token?: string;
    expires_at: number;
    id_token: string;
  };
  deviceIdHash?: string;
};

type LoginStateRecord = {
  state: string;
  nonce: string;
  code_verifier: string;
  // 绑定发起登录的浏览器：要求 callback 必须带同一个 HttpOnly csrfSid
  // 这样就算 code/state URL 泄露，外部请求也抢不到登录态（因为拿不到 cookie）
  csrfSid?: string;
  returnTo: string;
  deviceIdHash?: string;
  createdAt: number;
};

// OIDC_ISSUER: 浏览器可访问的公开地址（用于登录跳转与iss校验）
// OIDC_INTERNAL_ISSUER: 容器内可访问的内部地址（用于发现文档、token、jwks请求）
const DEFAULT_ISSUER = process.env.OIDC_ISSUER || 'http://localhost:9000';
const DEFAULT_INTERNAL_ISSUER = process.env.OIDC_INTERNAL_ISSUER || DEFAULT_ISSUER;
const DEFAULT_CLIENT_ID = process.env.OIDC_CLIENT_ID || 'ai-agent-bff';
const DEFAULT_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET || 'dev_secret_change_me';
const DEFAULT_REDIRECT_URI = process.env.OIDC_REDIRECT_URI || 'http://localhost:8080/api/auth/callback';
const FORCE_PROMPT_LOGIN = process.env.OIDC_FORCE_PROMPT_LOGIN === 'true';

const LOGIN_STATE_TTL_SEC = 10 * 60; // 10分钟
const SESSION_TTL_SEC = 7 * 24 * 3600; // 7天

function base64url(input: Buffer) {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function sha256Base64url(input: string) {
  const hash = createHash('sha256').update(input).digest();
  return base64url(hash);
}

function isHttps(headers?: Record<string, any>) {
  const proto = String(headers?.['x-forwarded-proto'] || headers?.['X-Forwarded-Proto'] || '').toLowerCase();
  if (proto) return proto === 'https';
  return process.env.NODE_ENV === 'production';
}

function cookieName(headers?: Record<string, any>) {
  // __Host- 前缀要求 Secure；本地 http 开发环境用普通名
  return isHttps(headers) ? '__Host-bff_sid' : 'bff_sid';
}

export function buildSetBffSessionCookie(sid: string, headers?: Record<string, any>) {
  const secure = isHttps(headers);
  const attrs = [
    `${cookieName(headers)}=${encodeURIComponent(sid)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
    `Max-Age=${SESSION_TTL_SEC}`,
  ];
  return attrs.join('; ');
}

export function buildClearBffSessionCookie(headers?: Record<string, any>) {
  const secure = isHttps(headers);
  const attrs = [
    `${cookieName(headers)}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
    'Max-Age=0',
  ];
  return attrs.join('; ');
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

function redis(): Redis {
  return getRedisClient();
}

function loginKey(state: string) {
  return `bff:oidc:login:${state}`;
}

function loginLockKey(state: string) {
  return `bff:oidc:login_lock:${state}`;
}

function sessionKey(sid: string) {
  return `bff:session:${sid}`;
}

let discoveryCache: any | null = null;
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

function joinIssuerPath(issuer: string, path: string) {
  const cleanIssuer = issuer.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanIssuer}${cleanPath}`;
}

export async function getDiscovery() {
  if (discoveryCache) return discoveryCache;
  const res = await fetch(`${DEFAULT_INTERNAL_ISSUER}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`OIDC discovery 失败: ${res.status}`);
  const raw = await res.json();
  // 对外（浏览器）用公开地址；对内（容器）走内部地址，避免把容器域名返回给浏览器
  discoveryCache = {
    ...(raw as Record<string, any>),
    issuer: DEFAULT_ISSUER,
    authorization_endpoint: joinIssuerPath(DEFAULT_ISSUER, '/auth'),
    end_session_endpoint: joinIssuerPath(DEFAULT_ISSUER, '/session/end'),
    token_endpoint: joinIssuerPath(DEFAULT_INTERNAL_ISSUER, '/token'),
    jwks_uri: joinIssuerPath(DEFAULT_INTERNAL_ISSUER, '/jwks'),
    userinfo_endpoint: joinIssuerPath(DEFAULT_INTERNAL_ISSUER, '/me'),
    pushed_authorization_request_endpoint: joinIssuerPath(DEFAULT_INTERNAL_ISSUER, '/request'),
  };
  return discoveryCache;
}

export async function getJwks() {
  if (jwksCache) return jwksCache;
  const discovery = await getDiscovery();
  jwksCache = createRemoteJWKSet(new URL(discovery.jwks_uri));
  return jwksCache;
}

export function createLoginState(input: { returnTo?: string; deviceIdHash?: string; csrfSid?: string }) {
  const state = base64url(randomBytes(24));
  const nonce = base64url(randomBytes(24));
  const code_verifier = base64url(randomBytes(32));
  const code_challenge = sha256Base64url(code_verifier);

  const returnTo = sanitizeReturnTo(input.returnTo);
  const deviceIdHash = input.deviceIdHash?.slice(0, 128) || undefined;
  const csrfSid = input.csrfSid?.slice(0, 256) || undefined;

  const record: LoginStateRecord = {
    state,
    nonce,
    code_verifier,
    returnTo,
    deviceIdHash,
    csrfSid,
    createdAt: Date.now(),
  };

  return { record, code_challenge };
}

export function readCsrfSidFromHeaders(headers?: Record<string, any>) {
  // 兼容 http/dev 与 https/prod 的 cookie 名
  const cookieHeader = headers?.cookie || headers?.Cookie;
  const cookies = parseCookies(cookieHeader);
  return (
    cookies['__Host-bff_csrf_sid']
    || cookies['bff_csrf_sid']
    || ''
  );
}

export async function saveLoginState(record: LoginStateRecord) {
  await redis().set(loginKey(record.state), JSON.stringify(record), 'EX', LOGIN_STATE_TTL_SEC);
}

export async function loadLoginState(state: string): Promise<LoginStateRecord | null> {
  const raw = await redis().get(loginKey(state));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LoginStateRecord;
  } catch {
    return null;
  }
}

export async function deleteLoginState(state: string) {
  await redis().del(loginKey(state));
}

/**
 * 尝试抢占“登录中间态”的处理权（一次性）。
 *
 * 目的：
 * - 防止 callback 并发/重复请求导致同一个 state 被处理多次
 * - 只在通过“浏览器绑定校验（csrfSid）”之后才抢占，避免外部耗尽 state
 */
export async function acquireLoginStateLock(state: string): Promise<boolean> {
  // ioredis 的类型定义对 set(NX/EX) 的重载比较严格，这里用宽松类型避免 TS 误报
  const client: any = redis();
  const res = (await client.set(loginLockKey(state), '1', 'NX', 'EX', 60)) as unknown;
  return res === 'OK';
}

export async function createBffSession(input: {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  deviceIdHash?: string;
}) {
  const sid = randomUUID();
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_SEC * 1000;
  const tokenExpiresAt = now + Math.max(1, input.expires_in) * 1000;

  // 校验 id_token（签名 + 标准声明 + nonce 由上层校验）
  const jwks = await getJwks();
  const { payload } = await jwtVerify(input.id_token, jwks, {
    issuer: DEFAULT_ISSUER,
    audience: DEFAULT_CLIENT_ID,
  });

  const user: BffUser = {
    sub: String(payload.sub || ''),
    username: payload.preferred_username ? String(payload.preferred_username) : undefined,
    name: payload.name ? String(payload.name) : undefined,
  };

  const session: BffSession = {
    sid,
    user,
    createdAt: now,
    expiresAt,
    deviceIdHash: input.deviceIdHash,
    tokens: {
      access_token: input.access_token,
      refresh_token: input.refresh_token,
      expires_at: tokenExpiresAt,
      id_token: input.id_token,
    },
  };

  await redis().set(sessionKey(sid), JSON.stringify(session), 'EX', SESSION_TTL_SEC);
  return session;
}

export async function getBffSessionFromHeaders(headers?: Record<string, any>): Promise<BffSession | null> {
  const cookieHeader = headers?.cookie || headers?.Cookie;
  const cookies = parseCookies(cookieHeader);
  const sid = cookies[cookieName(headers)];
  if (!sid) return null;
  const raw = await redis().get(sessionKey(sid));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BffSession;
  } catch {
    return null;
  }
}

export async function deleteBffSessionFromHeaders(headers?: Record<string, any>) {
  const cookieHeader = headers?.cookie || headers?.Cookie;
  const cookies = parseCookies(cookieHeader);
  const sid = cookies[cookieName(headers)];
  if (!sid) return;
  await redis().del(sessionKey(sid));
}

const DEFAULT_POST_LOGOUT_REDIRECT_URI =
  process.env.OIDC_POST_LOGOUT_REDIRECT_URI || 'http://localhost:8080/api/auth/logout/callback';

export async function buildEndSessionUrl(input: { id_token_hint: string; state?: string }) {
  const discovery = await getDiscovery();
  const endSessionEndpoint = discovery.end_session_endpoint as string | undefined;
  if (!endSessionEndpoint) return null;

  const url = new URL(endSessionEndpoint);
  url.searchParams.set('id_token_hint', input.id_token_hint);
  url.searchParams.set('post_logout_redirect_uri', DEFAULT_POST_LOGOUT_REDIRECT_URI);
  if (input.state) url.searchParams.set('state', input.state);
  return url.toString();
}

export function buildAuthorizationUrl(input: {
  state: string;
  nonce: string;
  code_challenge: string;
  deviceIdHash?: string;
}) {
  const url = new URL(joinIssuerPath(DEFAULT_ISSUER, '/auth'));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', DEFAULT_CLIENT_ID);
  url.searchParams.set('redirect_uri', DEFAULT_REDIRECT_URI);
  url.searchParams.set('scope', 'openid profile email offline_access');
  url.searchParams.set('state', input.state);
  url.searchParams.set('nonce', input.nonce);
  url.searchParams.set('code_challenge', input.code_challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // 在调试/演示环境可强制每次展示登录页，避免因已有IdP会话直接跳callback
  if (FORCE_PROMPT_LOGIN) {
    url.searchParams.set('prompt', 'login');
  }
  if (input.deviceIdHash) url.searchParams.set('deviceIdHash', input.deviceIdHash);
  return url.toString();
}

export async function exchangeCodeForTokens(input: {
  code: string;
  code_verifier: string;
}) {
  const discovery = await getDiscovery();
  const tokenEndpoint = discovery.token_endpoint as string;

  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', input.code);
  body.set('redirect_uri', DEFAULT_REDIRECT_URI);
  body.set('client_id', DEFAULT_CLIENT_ID);
  body.set('code_verifier', input.code_verifier);

  const basic = Buffer.from(`${DEFAULT_CLIENT_ID}:${DEFAULT_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basic}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`token 交换失败: ${res.status} ${text}`);
  }

  const json = await res.json();
  return json as {
    access_token: string;
    refresh_token?: string;
    id_token: string;
    expires_in: number;
    token_type: string;
  };
}

export async function verifyIdTokenNonce(idToken: string, expectedNonce: string) {
  const jwks = await getJwks();
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: DEFAULT_ISSUER,
    audience: DEFAULT_CLIENT_ID,
  });
  const nonce = payload.nonce ? String(payload.nonce) : '';
  if (!nonce || nonce !== expectedNonce) {
    throw new Error('id_token nonce 校验失败');
  }
}

export function sanitizeReturnTo(returnTo?: string) {
  if (!returnTo) return '/';
  // 只允许站内相对路径，防开放重定向
  if (returnTo.startsWith('/') && !returnTo.startsWith('//')) return returnTo;
  return '/';
}


