/**
 * 统一的 BFF 请求封装：写请求自动带 CSRF Token（Session-Bound）
 *
 * 约定：
 * - 服务端：GET /api/auth/csrf 返回 { data: { csrfToken } }，并设置 HttpOnly 的 csrfSid cookie
 * - 客户端：把 csrfToken 仅缓存到内存中；每次写请求带 X-CSRF-Token
 */

let cachedCsrfToken: string | null = null;
let inflight: Promise<string> | null = null;

export function clearCachedCsrfToken() {
  cachedCsrfToken = null;
}

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch('/api/auth/csrf', {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`获取 CSRF Token 失败: ${res.status}`);
  }
  const json = await res.json().catch(() => ({} as any));
  const token = json?.data?.csrfToken;
  if (!token || typeof token !== 'string') {
    throw new Error('获取 CSRF Token 失败: 返回格式不正确');
  }
  return token;
}

export async function getCsrfToken(): Promise<string> {
  if (cachedCsrfToken) return cachedCsrfToken;
  if (!inflight) {
    inflight = (async () => {
      const t = await fetchCsrfToken();
      cachedCsrfToken = t;
      return t;
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export async function fetchWithCsrf(input: RequestInfo | URL, init: RequestInit = {}) {
  const method = String(init.method || 'GET').toUpperCase();
  const isWrite = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';

  const headers = new Headers(init.headers || {});

  if (isWrite) {
    const csrfToken = await getCsrfToken();
    headers.set('X-CSRF-Token', csrfToken);
  }

  return fetch(input, {
    ...init,
    headers,
    // 同源默认会带 cookie，但显式写上更稳（兼容未来可能的子域/代理）
    credentials: init.credentials ?? 'include',
  });
}


