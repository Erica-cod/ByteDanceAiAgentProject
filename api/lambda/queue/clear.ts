/**
 * POST /api/queue/clear
 * 
 * 清空队列（紧急情况，慎用）
 * 
 * 注意：生产环境应该添加管理员权限验证
 */

import { getGlobalLLMQueue } from '../../_clean/infrastructure/llm/llm-request-queue.js';

export const post = async () => {
  try {
    // TODO: 生产环境应该添加管理员权限验证
    // const isAdmin = await checkAdminPermission(req);
    // if (!isAdmin) {
    //   return {
    //     status: 'error',
    //     message: '权限不足：需要管理员权限',
    //     timestamp: Date.now(),
    //   };
    // }

    const queue = getGlobalLLMQueue();
    const queueLength = queue.getStats().queueLength;
    
    queue.clear();

    return {
      status: 'ok',
      message: `队列已清空，拒绝了 ${queueLength} 个等待中的请求`,
      clearedCount: queueLength,
      timestamp: Date.now(),
    };
  } catch (error: any) {
    console.error('❌ [QueueMonitoring] 清空队列失败:', error);
    return {
      status: 'error',
      message: error.message,
      timestamp: Date.now(),
    };
  }
};

