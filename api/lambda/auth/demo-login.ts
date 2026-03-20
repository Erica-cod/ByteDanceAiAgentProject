/**
 * 演示登录（不接入企业 IdP）
 * 路由：POST /api/auth/demo-login
 *
 * 请求体：
 * - username?: string
 */

import type { RequestOption } from '../../types/chat.js';
import { getCorsHeaders, handleOptionsRequest } from '../_utils/cors.js';
import { createDemoSession, buildSetSessionCookie } from '../_utils/demoAuth.js';
import { enforceAuthRateLimit } from '../_utils/authRateLimit.js';
import { verifyOriginOrReferer } from '../_utils/csrf.js';

type DemoLoginBody = { username?: string };

export async function options({ headers }: RequestOption<any, any>) {
  const origin = headers?.origin;
  return handleOptionsRequest(origin);
}

export async function post({ data, headers }: RequestOption<any, DemoLoginBody>) {
  const requestOrigin = headers?.origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  const originCheck = verifyOriginOrReferer(headers);
  if (!originCheck.ok) {
    return new Response(
      JSON.stringify({ success: false, error: originCheck.message }),
      { status: originCheck.status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders } },
    );
  }

  const limitResp = await enforceAuthRateLimit({
    endpoint: 'auth_login',
    headers,
    requestOrigin,
  });
  if (limitResp) return limitResp;

  const username = (data?.username || '').trim();
  const session = createDemoSession(username);

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        loggedIn: true,
        user: session.user,
        canUseMultiAgent: true,
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': buildSetSessionCookie(session.sid, headers),
        ...corsHeaders,
      },
    }
  );
}


