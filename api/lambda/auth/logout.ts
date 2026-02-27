/**
 * 演示退出登录
 * 路由：POST /api/auth/logout
 */

import type { RequestOption } from '../../types/chat.js';
import { getCorsHeaders, handleOptionsRequest } from '../_utils/cors.js';
import {
  buildClearBffSessionCookie,
  deleteBffSessionFromHeaders,
  getBffSessionFromHeaders,
  buildEndSessionUrl,
} from '../_utils/bffOidcAuth.js';
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

  // 先读取会话（获取 id_token_hint），再删除
  const session = await getBffSessionFromHeaders(headers);
  await deleteBffSessionFromHeaders(headers);

  // 如果存在 IdP 的 end_session_endpoint，则返回登出 URL 让前端做整页跳转（清 IdP cookie）
  const idpLogoutUrl = session?.tokens?.id_token
    ? await buildEndSessionUrl({ id_token_hint: session.tokens.id_token })
    : null;

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        loggedIn: false,
        // 前端若拿到此 URL，应 window.location.assign(...)，从而同时登出 IdP
        idpLogoutUrl,
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': buildClearBffSessionCookie(headers),
        ...(idpLogoutUrl ? { 'X-IdP-Logout-Url': idpLogoutUrl } : {}),
        ...corsHeaders,
      },
    }
  );
}


