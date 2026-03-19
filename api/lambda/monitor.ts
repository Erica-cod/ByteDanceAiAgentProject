/**
 * 监控事件接收端点
 * 路由: /api/monitor
 *
 * 接收 ai-stream-monitor SDK 上报的遥测事件。
 * 当前版本仅做日志输出，后续可对接 ELK / Grafana 等后端。
 */

import { createJsonResponse, handleOptionsRequest } from './_utils/cors.js';

export async function options({ headers }: any) {
  return handleOptionsRequest(headers?.origin);
}

export async function post({ data, headers }: any) {
  const origin = headers?.origin;

  try {
    const events: unknown[] = data;

    if (!Array.isArray(events)) {
      return createJsonResponse({ error: 'events 应为数组' }, 400, origin);
    }

    for (const evt of events) {
      const e = evt as Record<string, unknown>;
      console.log(`[Monitor] ${e.type}`, JSON.stringify(e.data ?? {}));
    }

    return createJsonResponse({ ok: true, received: events.length }, 200, origin);
  } catch (err: any) {
    console.error('[Monitor] 解析失败:', err);
    return createJsonResponse({ error: '请求体解析失败' }, 400, origin);
  }
}
