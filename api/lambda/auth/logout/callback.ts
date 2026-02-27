/**
 * IdP logout 回跳（RP-Initiated Logout）
 * 路由：GET /api/auth/logout/callback
 *
 * IdP 清理自己的 session 后，会跳回这里。
 * 在这里兜底清理 BFF cookie，然后重定向回首页（或安全的站内路径）。
 */

import type { RequestOption } from '../../../types/chat.js';
import { handleOptionsRequest } from '../../_utils/cors.js';
import { buildClearBffSessionCookie, sanitizeReturnTo } from '../../_utils/bffOidcAuth.js';

export async function options({ headers }: RequestOption<any, any>) {
  const origin = headers?.origin;
  return handleOptionsRequest(origin);
}

export async function get({ query, headers }: RequestOption<{ returnTo?: string }, any>) {
  const returnTo = sanitizeReturnTo(query?.returnTo);

  return new Response(null, {
    status: 302,
    headers: {
      // 兜底：确保 BFF cookie 已清
      'Set-Cookie': buildClearBffSessionCookie(headers),
      Location: returnTo,
    },
  });
}


