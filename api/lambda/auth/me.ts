/**
 * 演示登录态查询
 * 路由：GET /api/auth/me
 */

import type { RequestOption } from '../../types/chat.js';
import { handleOptionsRequest } from '../_utils/cors.js';
import { getDemoSessionFromHeaders } from '../_utils/demoAuth.js';
import { successResponse } from '../_utils/response.js';

export async function options({ headers }: RequestOption<any, any>) {
  const origin = headers?.origin;
  return handleOptionsRequest(origin);
}

export async function get({ headers }: RequestOption<any, any>) {
  const requestOrigin = headers?.origin;
  const session = getDemoSessionFromHeaders(headers);

  if (!session) {
    return successResponse(
      {
        loggedIn: false,
        user: null,
        canUseMultiAgent: false,
      },
      undefined,
      requestOrigin
    );
  }

  return successResponse(
    {
      loggedIn: true,
      user: session.user,
      canUseMultiAgent: true,
    },
    undefined,
    requestOrigin
  );
}


