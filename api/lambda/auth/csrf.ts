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
import { enforceAuthRateLimit, buildAuthStoreUnavailableResponse } from '../_utils/authRateLimit.js';

export async function options({ headers }: RequestOption<any, any>) {
  const origin = headers?.origin;
  return handleOptionsRequest(origin);
}

export async function get({ headers }: RequestOption<any, any>) {
  const requestOrigin = headers?.origin;
  const limitResp = await enforceAuthRateLimit({
    endpoint: 'auth_csrf',
    headers,
    requestOrigin,
  });
  if (limitResp) return limitResp;

  const corsHeaders = getCorsHeaders(requestOrigin);
  try {
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
  } catch (error) {
    console.error('[auth/csrf] CSRF token 下发失败:', error);
    return buildAuthStoreUnavailableResponse(requestOrigin);
  }
}


