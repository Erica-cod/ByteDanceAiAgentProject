/**
 * 演示退出登录
 * 路由：POST /api/auth/logout
 */

import type { RequestOption } from '../../types/chat.js';
import { getCorsHeaders, handleOptionsRequest } from '../_utils/cors.js';
import { buildClearBffSessionCookie, deleteBffSessionFromHeaders } from '../_utils/bffOidcAuth.js';
import { requireCsrf } from '../_utils/csrf.js';
import { errorResponseWithStatus } from '../_utils/response.js';

export async function options({ headers }: RequestOption<any, any>) {
  const origin = headers?.origin;
  return handleOptionsRequest(origin);
}

export async function post({ headers }: RequestOption<any, any>) {
  const requestOrigin = headers?.origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  const csrf = await requireCsrf(headers);
  if (csrf.ok === false) {
    return errorResponseWithStatus(csrf.message, csrf.status, requestOrigin);
  }

  await deleteBffSessionFromHeaders(headers);

  return new Response(
    JSON.stringify({
      success: true,
      data: { loggedIn: false },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': buildClearBffSessionCookie(headers),
        ...corsHeaders,
      },
    }
  );
}


