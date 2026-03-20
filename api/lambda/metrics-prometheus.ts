/**
 * Prometheus 指标抓取端点
 * 路由: GET /api/metrics-prometheus
 *
 * 供 Prometheus 定时抓取，返回 OpenMetrics 格式文本。
 */
import { register } from './_utils/prometheusMetrics.js';

export async function get() {
  const metrics = await register.metrics();
  return new Response(metrics, {
    status: 200,
    headers: {
      'Content-Type': register.contentType,
    },
  });
}
