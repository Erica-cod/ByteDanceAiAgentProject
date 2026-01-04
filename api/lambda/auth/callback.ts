/**
 * OIDC 回调（BFF 用授权码换 token，校验 id_token，建立 BFF 会话）
 * 路由：GET /api/auth/callback
 *
 * query:
 * - code: string
 * - state: string
 */

import type { RequestOption } from '../../types/chat.js';
import { handleOptionsRequest } from '../_utils/cors.js';
import {
  loadLoginState,
  deleteLoginState,
  exchangeCodeForTokens,
  verifyIdTokenNonce,
  createBffSession,
  buildSetBffSessionCookie,
  sanitizeReturnTo,
} from '../_utils/bffOidcAuth.js';

export async function options({ headers }: RequestOption<any, any>) {
  const origin = headers?.origin;
  return handleOptionsRequest(origin);
}

export async function get({
  query,
  headers,
}: RequestOption<{ code?: string; state?: string }, any>) {
  const code = query?.code;
  const state = query?.state;

  if (!code || !state) {
    return new Response('缺少 code/state', { status: 400 });
  }

  const record = await loadLoginState(state);
  if (!record) {
    return new Response('登录 state 无效或已过期', { status: 400 });
  }

  // 单次使用，先删掉（避免重放）
  await deleteLoginState(state);

  // 用授权码换 token（含 refresh_token）
  const tokens = await exchangeCodeForTokens({
    code,
    code_verifier: record.code_verifier,
  });

  // 校验 nonce（防重放）
  await verifyIdTokenNonce(tokens.id_token, record.nonce);

  // 建立 BFF 会话（并进行 id_token 基础校验：iss/aud/签名）
  const session = await createBffSession({
    id_token: tokens.id_token,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
    deviceIdHash: record.deviceIdHash,
  });

  const returnTo = sanitizeReturnTo(record.returnTo);

  return new Response(null, {
    status: 302,
    headers: {
      'Set-Cookie': buildSetBffSessionCookie(session.sid, headers),
      Location: returnTo,
    },
  });
}


