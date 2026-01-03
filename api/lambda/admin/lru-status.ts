/**
 * LRU Status API - LRU 系统状态查询和管理
 * 
 * GET /api/admin/lru-status - 获取 LRU 调度器状态
 * POST /api/admin/lru-status/trigger - 手动触发清理任务
 */

import type { RequestOption } from '../../types/chat.js';
import { getLRUScheduler } from '../../services/lruScheduler.js';

function successResponse(data: any, requestOrigin?: string) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': requestOrigin || '*',
      'Access-Control-Allow-Credentials': 'true',
    },
    body: JSON.stringify({
      success: true,
      data,
    }),
  };
}

function errorResponse(message: string, requestOrigin?: string) {
  return {
    statusCode: 400,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': requestOrigin || '*',
      'Access-Control-Allow-Credentials': 'true',
    },
    body: JSON.stringify({
      success: false,
      error: message,
    }),
  };
}

/**
 * GET /api/admin/lru-status - 获取 LRU 调度器状态
 */
export async function get({ headers }: RequestOption<any, any>) {
  try {
    const requestOrigin = headers?.origin;
    const scheduler = getLRUScheduler();
    const status = scheduler.getStatus();

    return successResponse(status, requestOrigin);
  } catch (error: any) {
    console.error('❌ 获取 LRU 状态失败:', error);
    return errorResponse(error.message || '获取 LRU 状态失败', headers?.origin);
  }
}

/**
 * POST /api/admin/lru-status/trigger - 手动触发清理任务
 */
export async function post({ headers }: RequestOption<any, any>) {
  try {
    const requestOrigin = headers?.origin;
    const scheduler = getLRUScheduler();
    const result = await scheduler.triggerCleanup();

    return successResponse({
      message: '清理任务已触发',
      result,
    }, requestOrigin);
  } catch (error: any) {
    console.error('❌ 触发 LRU 清理失败:', error);
    return errorResponse(error.message || '触发 LRU 清理失败', headers?.origin);
  }
}

