/**
 * GET /api/queue/items
 *
 * 获取队列中的所有请求（调试/管理用）
 */

import { getGlobalLLMQueue } from '../../_clean/infrastructure/llm/llm-request-queue.js';
import { requireAdmin } from '../_utils/adminGuard.js';
import { createJsonResponse } from '../_utils/cors.js';

export const get = async ({ headers }: { headers?: Record<string, any> }) => {
  const guard = await requireAdmin(headers, headers?.origin);
  if (!guard.ok) return guard.response;

  try {
    const queue = getGlobalLLMQueue();
    const items = queue.getQueueItems();

    return createJsonResponse({
      status: 'ok',
      timestamp: Date.now(),
      items,
      count: items.length,
    }, 200, headers?.origin);
  } catch (error: any) {
    console.error('[QueueMonitoring] 获取队列项失败:', error);
    return createJsonResponse({
      status: 'error',
      message: '操作失败，请稍后重试',
      timestamp: Date.now(),
    }, 500, headers?.origin);
  }
};
