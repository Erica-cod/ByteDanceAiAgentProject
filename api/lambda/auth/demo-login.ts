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

type DemoLoginBody = { username?: string };

export async function options({ headers }: RequestOption<any, any>) {
  const origin = headers?.origin;
  return handleOptionsRequest(origin);
}

export async function post({ data, headers }: RequestOption<any, DemoLoginBody>) {
  const requestOrigin = headers?.origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

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


