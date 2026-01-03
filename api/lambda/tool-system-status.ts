/**
 * 工具系统监控 API
 * 路由: /api/tool-system-status
 * 
 * GET - 获取所有工具状态
 * POST - 重置指标（管理员）
 */

import { toolExecutor } from '../tools/v2/core/tool-executor.js';
import { toolRegistry } from '../tools/v2/core/tool-registry.js';
import { cacheManager } from '../tools/v2/core/cache-manager.js';
import { rateLimiter } from '../tools/v2/core/rate-limiter.js';
import { circuitBreaker } from '../tools/v2/core/circuit-breaker.js';
import { createJsonResponse, handleOptionsRequest } from './_utils/cors.js';

/**
 * OPTIONS - 处理预检请求
 */
export async function options({ headers }: any) {
  const origin = headers?.origin;
  return handleOptionsRequest(origin);
}

/**
 * GET /api/tool-system-status
 * 获取工具系统概览状态
 */
export async function get({ headers }: any = {}) {
  const requestOrigin = headers?.origin;
  
  try {
    const metrics = toolExecutor.getAllMetrics();
    const cacheStats = cacheManager.getStats();

    // 汇总统计
    const summary = {
      totalTools: toolRegistry.getAllNames().length,
      enabledTools: toolRegistry.getEnabledCount(),
      healthyTools: metrics.filter(m => m.status === 'healthy').length,
      degradedTools: metrics.filter(m => m.status === 'degraded').length,
      unavailableTools: metrics.filter(m => m.status === 'unavailable').length,
    };

    return createJsonResponse({
      summary,
      tools: metrics,
      cache: cacheStats,
      timestamp: new Date().toISOString(),
    }, 200, requestOrigin);
  } catch (error: any) {
    console.error('获取工具状态失败:', error);

    return createJsonResponse({
      error: '获取工具状态失败',
      message: error.message,
    }, 500, requestOrigin);
  }
}

/**
 * 获取指定工具的详细指标（内部使用）
 */
function getToolMetrics(toolName: string) {
  try {
    const metrics = toolExecutor.getMetrics(toolName);

    if (!metrics) {
      return {
        error: `工具 "${toolName}" 不存在`,
      };
    }

    // 获取更详细的信息
    const rlStatus = rateLimiter.getStatus(toolName);
    const cbStats = circuitBreaker.getStats(toolName);
    const cacheStats = cacheManager.getToolStats(toolName);

    return {
      tool: toolName,
      metrics,
      rateLimiter: rlStatus,
      circuitBreaker: cbStats,
      cache: cacheStats,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error(`获取工具 "${toolName}" 指标失败:`, error);
    return {
      error: '获取工具指标失败',
      message: error.message,
    };
  }
}

/**
 * POST /api/tool-system-status
 * 重置工具系统（清除缓存、重置指标）
 */
export async function post({ data, headers }: any) {
  const requestOrigin = headers?.origin;
  
  try {
    // TODO: 添加管理员权限验证
    // const isAdmin = await verifyAdmin(headers);
    // if (!isAdmin) {
    //   return createJsonResponse({ error: '权限不足' }, 403, requestOrigin);
    // }

    const { action, toolName } = data || {};

    switch (action) {
      case 'clear-cache':
        if (toolName) {
          const cleared = cacheManager.clear(toolName);
          return createJsonResponse({
            message: `已清除工具 "${toolName}" 的缓存`,
            cleared,
          }, 200, requestOrigin);
        } else {
          cacheManager.clearAll();
          return createJsonResponse({
            message: '已清除所有缓存',
          }, 200, requestOrigin);
        }

      case 'reset-metrics':
        if (toolName) {
          toolExecutor.resetMetrics(toolName);
          return createJsonResponse({
            message: `已重置工具 "${toolName}" 的指标`,
          }, 200, requestOrigin);
        } else {
          toolExecutor.resetAllMetrics();
          return createJsonResponse({
            message: '已重置所有工具指标',
          }, 200, requestOrigin);
        }

      case 'reset-circuit-breaker':
        if (!toolName) {
          return createJsonResponse({
            error: '必须指定 toolName',
          }, 400, requestOrigin);
        }
        circuitBreaker.reset(toolName);
        return createJsonResponse({
          message: `已重置工具 "${toolName}" 的熔断器`,
        }, 200, requestOrigin);

      case 'reset-rate-limiter':
        if (toolName) {
          rateLimiter.reset(toolName);
          return createJsonResponse({
            message: `已重置工具 "${toolName}" 的限流器`,
          }, 200, requestOrigin);
        } else {
          rateLimiter.resetAll();
          return createJsonResponse({
            message: '已重置所有工具的限流器',
          }, 200, requestOrigin);
        }

      default:
        return createJsonResponse({
          error: '未知的操作',
          validActions: [
            'clear-cache',
            'reset-metrics',
            'reset-circuit-breaker',
            'reset-rate-limiter',
          ],
        }, 400, requestOrigin);
    }
  } catch (error: any) {
    console.error('工具系统操作失败:', error);

    return createJsonResponse({
      error: '操作失败',
      message: error.message,
    }, 500, requestOrigin);
  }
}

