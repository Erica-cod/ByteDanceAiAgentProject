/**
 * POST /api/queue/pause
 *
 * 暂停队列处理（紧急情况）
 */

import { getGlobalLLMQueue } from '../../_clean/infrastructure/llm/llm-request-queue.js';
import { requireAdmin } from '../_utils/adminGuard.js';
import { createJsonResponse } from '../_utils/cors.js';

export const post = async ({ headers }: { headers?: Record<string, any> }) => {
  const guard = await requireAdmin(headers, headers?.origin);
  if (!guard.ok) return guard.response;

  try {
    const queue = getGlobalLLMQueue();
    queue.pause();

    return createJsonResponse({
      status: 'ok',
      message: '队列已暂停',
      timestamp: Date.now(),
    }, 200, headers?.origin);
  } catch (error: any) {
    console.error('[QueueMonitoring] 暂停队列失败:', error);
    return createJsonResponse({
      status: 'error',
      message: '操作失败，请稍后重试',
      timestamp: Date.now(),
    }, 500, headers?.origin);
  }
};
