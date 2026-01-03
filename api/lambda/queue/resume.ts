/**
 * POST /api/queue/resume
 * 
 * 恢复队列处理
 */

import { getGlobalLLMQueue } from '../../_clean/infrastructure/llm/llm-request-queue.js';

export const post = async () => {
  try {
    const queue = getGlobalLLMQueue();
    queue.resume();

    return {
      status: 'ok',
      message: '队列已恢复',
      timestamp: Date.now(),
    };
  } catch (error: any) {
    console.error('❌ [QueueMonitoring] 恢复队列失败:', error);
    return {
      status: 'error',
      message: error.message,
      timestamp: Date.now(),
    };
  }
};

