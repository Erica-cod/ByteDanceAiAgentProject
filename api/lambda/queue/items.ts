/**
 * GET /api/queue/items
 * 
 * 获取队列中的所有请求（调试用）
 */

import { getGlobalLLMQueue } from '../../_clean/infrastructure/llm/llm-request-queue.js';

export const get = async () => {
  try {
    const queue = getGlobalLLMQueue();
    const items = queue.getQueueItems();

    return {
      status: 'ok',
      timestamp: Date.now(),
      items,
      count: items.length,
    };
  } catch (error: any) {
    console.error('❌ [QueueMonitoring] 获取队列项失败:', error);
    return {
      status: 'error',
      message: error.message,
      timestamp: Date.now(),
    };
  }
};

