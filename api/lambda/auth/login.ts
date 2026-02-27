/**
 * OIDC 登录入口（BFF 发起授权码 + PKCE）
 * 路由：GET /api/auth/login
 *
 * query:
 * - returnTo?: string
 * - deviceIdHash?: string
 */

import type { RequestOption } from '../../types/chat.js';
import { handleOptionsRequest } from '../_utils/cors.js';
import { createLoginState, saveLoginState, buildAuthorizationUrl } from '../_utils/bffOidcAuth.js';
import { issueCsrfToken } from '../_utils/csrf.js';

export async function options({ headers }: RequestOption<any, any>) {
  const origin = headers?.origin;
  return handleOptionsRequest(origin);
}

export async function get({ query, headers }: RequestOption<{ returnTo?: string; deviceIdHash?: string }, any>) {
  // ✅ 绑定浏览器：确保存在 HttpOnly csrfSid cookie（没有就发一个）
  const issued = await issueCsrfToken(headers);

  const { record, code_challenge } = createLoginState({
    returnTo: query?.returnTo,
    deviceIdHash: query?.deviceIdHash,
    csrfSid: issued.csrfSid,
  });

  await saveLoginState(record);

  const location = buildAuthorizationUrl({
    state: record.state,
    nonce: record.nonce,
    code_challenge,
    deviceIdHash: record.deviceIdHash,
  });

  const outHeaders: Record<string, string> = {
    Location: location,
  };
  if (issued.setCookie) outHeaders['Set-Cookie'] = issued.setCookie;

  return new Response(null, {
    status: 302,
    headers: {
      ...outHeaders,
    },
  });
}


