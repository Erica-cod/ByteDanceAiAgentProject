/**
 * LRU Status API - LRU 系统状态查询和管理
 *
 * GET  /api/admin/lru-status          - 获取 LRU 调度器状态
 * POST /api/admin/lru-status/trigger  - 手动触发清理任务
 */

import type { RequestOption } from '../../types/chat.js';
import { getLRUScheduler } from '../../services/lruScheduler.js';
import { requireAdmin } from '../_utils/adminGuard.js';
import { createJsonResponse } from '../_utils/cors.js';

/**
 * GET /api/admin/lru-status
 */
export async function get({ headers }: RequestOption<any, any>) {
  const requestOrigin = headers?.origin;
  const guard = await requireAdmin(headers, requestOrigin);
  if (!guard.ok) return guard.response;

  try {
    const scheduler = getLRUScheduler();
    const status = scheduler.getStatus();

    return createJsonResponse({ success: true, data: status }, 200, requestOrigin);
  } catch (error: any) {
    console.error('[Admin] 获取 LRU 状态失败:', error);
    return createJsonResponse({ success: false, error: '获取 LRU 状态失败' }, 500, requestOrigin);
  }
}

/**
 * POST /api/admin/lru-status/trigger
 */
export async function post({ headers }: RequestOption<any, any>) {
  const requestOrigin = headers?.origin;
  const guard = await requireAdmin(headers, requestOrigin);
  if (!guard.ok) return guard.response;

  try {
    const scheduler = getLRUScheduler();
    const result = await scheduler.triggerCleanup();

    return createJsonResponse({
      success: true,
      data: { message: '清理任务已触发', result },
    }, 200, requestOrigin);
  } catch (error: any) {
    console.error('[Admin] 触发 LRU 清理失败:', error);
    return createJsonResponse({ success: false, error: '触发 LRU 清理失败' }, 500, requestOrigin);
  }
}
