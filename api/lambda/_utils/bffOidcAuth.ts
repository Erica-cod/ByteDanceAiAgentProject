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
  returnTo: string;
  deviceIdHash?: string;
  createdAt: number;
};

const DEFAULT_ISSUER = process.env.OIDC_ISSUER || 'http://localhost:9000';
const DEFAULT_CLIENT_ID = process.env.OIDC_CLIENT_ID || 'ai-agent-bff';
const DEFAULT_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET || 'dev_secret_change_me';
const DEFAULT_REDIRECT_URI = process.env.OIDC_REDIRECT_URI || 'http://localhost:8080/api/auth/callback';

const LOGIN_STATE_TTL_SEC = 10 * 60; // 10分钟
const SESSION_TTL_SEC = 7 * 24 * 3600; // 7天

function base64url(input: Buffer) {
  return input
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
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

function sessionKey(sid: string) {
  return `bff:session:${sid}`;
}

let discoveryCache: any | null = null;
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

export async function getDiscovery() {
  if (discoveryCache) return discoveryCache;
  const res = await fetch(`${DEFAULT_ISSUER}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`OIDC discovery 失败: ${res.status}`);
  discoveryCache = await res.json();
  return discoveryCache;
}

export async function getJwks() {
  if (jwksCache) return jwksCache;
  const discovery = await getDiscovery();
  jwksCache = createRemoteJWKSet(new URL(discovery.jwks_uri));
  return jwksCache;
}

export function createLoginState(input: { returnTo?: string; deviceIdHash?: string }) {
  const state = base64url(randomBytes(24));
  const nonce = base64url(randomBytes(24));
  const code_verifier = base64url(randomBytes(32));
  const code_challenge = sha256Base64url(code_verifier);

  const returnTo = sanitizeReturnTo(input.returnTo);
  const deviceIdHash = input.deviceIdHash?.slice(0, 128) || undefined;

  const record: LoginStateRecord = {
    state,
    nonce,
    code_verifier,
    returnTo,
    deviceIdHash,
    createdAt: Date.now(),
  };

  return { record, code_challenge };
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

export function buildAuthorizationUrl(input: {
  state: string;
  nonce: string;
  code_challenge: string;
  deviceIdHash?: string;
}) {
  const url = new URL(`${DEFAULT_ISSUER}/auth`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', DEFAULT_CLIENT_ID);
  url.searchParams.set('redirect_uri', DEFAULT_REDIRECT_URI);
  url.searchParams.set('scope', 'openid profile email offline_access');
  url.searchParams.set('state', input.state);
  url.searchParams.set('nonce', input.nonce);
  url.searchParams.set('code_challenge', input.code_challenge);
  url.searchParams.set('code_challenge_method', 'S256');
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


