/**
 * CSRF Token 下发（Session-Bound）
 * 路由：GET /api/auth/csrf
 *
 * 返回：
 * - JSON: { success: true, data: { csrfToken } }
 * - Set-Cookie: bff_csrf_sid / __Host-bff_csrf_sid（HttpOnly, SameSite=Lax）
 */

import type { RequestOption } from '../../types/chat.js';
import { getCorsHeaders, handleOptionsRequest } from '../_utils/cors.js';
import { issueCsrfToken } from '../_utils/csrf.js';

export async function options({ headers }: RequestOption<any, any>) {
  const origin = headers?.origin;
  return handleOptionsRequest(origin);
}

export async function get({ headers }: RequestOption<any, any>) {
  const requestOrigin = headers?.origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  const { csrfToken, setCookie } = await issueCsrfToken(headers);

  const outHeaders: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders,
  };
  if (setCookie) outHeaders['Set-Cookie'] = setCookie;

  return new Response(
    JSON.stringify({
      success: true,
      data: { csrfToken },
    }),
    { status: 200, headers: outHeaders }
  );
}


