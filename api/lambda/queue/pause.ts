/**
 * POST /api/queue/pause
 * 
 * 暂停队列处理（紧急情况）
 */

import { getGlobalLLMQueue } from '../../_clean/infrastructure/llm/llm-request-queue.js';

export const post = async () => {
  try {
    const queue = getGlobalLLMQueue();
    queue.pause();

    return {
      status: 'ok',
      message: '队列已暂停',
      timestamp: Date.now(),
    };
  } catch (error: any) {
    console.error('❌ [QueueMonitoring] 暂停队列失败:', error);
    return {
      status: 'error',
      message: error.message,
      timestamp: Date.now(),
    };
  }
};

