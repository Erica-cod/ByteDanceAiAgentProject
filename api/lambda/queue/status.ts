/**
 * GET /api/queue/status
 * 
 * 获取 LLM 请求队列的当前状态
 */

import { getGlobalLLMQueue } from '../../_clean/infrastructure/llm/llm-request-queue.js';

export const get = async () => {
  try {
    const queue = getGlobalLLMQueue();
    const stats = queue.getStats();

    return {
      status: 'ok',
      timestamp: Date.now(),
      queue: stats,
    };
  } catch (error: any) {
    console.error('❌ [QueueMonitoring] 获取状态失败:', error);
    return {
      status: 'error',
      message: error.message,
      timestamp: Date.now(),
    };
  }
};

