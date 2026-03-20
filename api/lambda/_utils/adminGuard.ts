/**
 * 管理接口鉴权守卫
 *
 * 要求请求方持有有效的 BFF Session 才能访问管理类接口
 * （如队列操作、LRU 管理等）。
 *
 * 当前检查逻辑：存在有效 BFF Session 即可。
 * 后续可在此扩展角色/权限体系。
 */

import { getBffSessionFromHeaders, type BffSession } from './bffOidcAuth.js';
import { createJsonResponse } from './cors.js';

export interface AdminGuardResult {
  ok: true;
  session: BffSession;
}

export interface AdminGuardFail {
  ok: false;
  response: Response;
}

export async function requireAdmin(
  headers?: Record<string, any>,
  requestOrigin?: string,
): Promise<AdminGuardResult | AdminGuardFail> {
  const session = await getBffSessionFromHeaders(headers);
  if (!session) {
    return {
      ok: false,
      response: createJsonResponse(
        { success: false, error: '需要登录后才能访问管理接口' },
        403,
        requestOrigin,
      ),
    };
  }
  return { ok: true, session };
}
