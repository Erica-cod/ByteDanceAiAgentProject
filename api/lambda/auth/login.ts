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

export async function options({ headers }: RequestOption<any, any>) {
  const origin = headers?.origin;
  return handleOptionsRequest(origin);
}

export async function get({ query }: RequestOption<{ returnTo?: string; deviceIdHash?: string }, any>) {
  const { record, code_challenge } = createLoginState({
    returnTo: query?.returnTo,
    deviceIdHash: query?.deviceIdHash,
  });

  await saveLoginState(record);

  const location = buildAuthorizationUrl({
    state: record.state,
    nonce: record.nonce,
    code_challenge,
    deviceIdHash: record.deviceIdHash,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
    },
  });
}


