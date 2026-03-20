/**
 * 监控事件接收端点
 * 路由: /api/monitor
 *
 * 接收 ai-stream-monitor SDK 上报的遥测事件，
 * 同时将事件转换为 Prometheus 指标供 Grafana 消费。
 */

import { createJsonResponse, handleOptionsRequest } from './_utils/cors.js';
import { recordEvent } from './_utils/prometheusMetrics.js';
import { verifyOriginOrReferer } from './_utils/csrf.js';

export async function options({ headers }: any) {
  return handleOptionsRequest(headers?.origin);
}

export async function post({ data, headers }: any) {
  const origin = headers?.origin;

  const originCheck = verifyOriginOrReferer(headers);
  if (!originCheck.ok) {
    return createJsonResponse({ error: originCheck.message }, originCheck.status, origin);
  }

  try {
    const events: unknown[] = data;

    if (!Array.isArray(events)) {
      return createJsonResponse({ error: 'events 应为数组' }, 400, origin);
    }

    for (const evt of events) {
      const e = evt as Record<string, any>;

      try {
        recordEvent(e as { type: string; data: Record<string, any>; context: Record<string, any> });
      } catch (metricErr) {
        console.warn('[Monitor] Prometheus 指标记录失败:', metricErr);
      }
    }

    return createJsonResponse({ ok: true, received: events.length }, 200, origin);
  } catch (err: any) {
    console.error('[Monitor] 解析失败:', err);
    return createJsonResponse({ error: '请求体解析失败' }, 400, origin);
  }
}
