/**
 * Prometheus 指标注册中心
 *
 * 基于 ai-stream-monitor SDK 事件定义对应的 Prometheus 指标。
 * 被 monitor.ts（写入指标）和 metrics-prometheus.ts（输出指标）共同引用。
 */
import { Registry, Histogram, Counter, Gauge } from 'prom-client';

export const register = new Registry();

register.setDefaultLabels({ service: 'ai-stream-monitor' });

// ---------------------------------------------------------------------------
// Stream 生命周期指标
// ---------------------------------------------------------------------------

export const streamTTFT = new Histogram({
  name: 'ai_monitor_stream_ttft_seconds',
  help: 'Time to first token (seconds)',
  labelNames: ['app_id', 'model', 'provider'] as const,
  buckets: [0.1, 0.3, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const streamTTLB = new Histogram({
  name: 'ai_monitor_stream_ttlb_seconds',
  help: 'Time to last byte — full stream duration (seconds)',
  labelNames: ['app_id', 'model', 'provider'] as const,
  buckets: [1, 3, 5, 10, 30, 60, 120],
  registers: [register],
});

export const streamTPS = new Histogram({
  name: 'ai_monitor_stream_tps',
  help: 'Tokens per second at stream completion',
  labelNames: ['app_id', 'model', 'provider'] as const,
  buckets: [5, 10, 20, 40, 80, 150],
  registers: [register],
});

export const streamTokens = new Counter({
  name: 'ai_monitor_stream_tokens_total',
  help: 'Cumulative token count',
  labelNames: ['app_id', 'model', 'provider', 'token_type'] as const,
  registers: [register],
});

export const streamPhase = new Histogram({
  name: 'ai_monitor_stream_phase_seconds',
  help: 'Duration of a stream phase (thinking, generating, etc.)',
  labelNames: ['app_id', 'phase'] as const,
  buckets: [0.5, 1, 3, 5, 10, 30],
  registers: [register],
});

export const streamStalls = new Counter({
  name: 'ai_monitor_stream_stalls_total',
  help: 'Number of stream stall events detected',
  labelNames: ['app_id'] as const,
  registers: [register],
});

export const streamErrors = new Counter({
  name: 'ai_monitor_stream_errors_total',
  help: 'Stream errors',
  labelNames: ['app_id', 'model'] as const,
  registers: [register],
});

export const streamActive = new Gauge({
  name: 'ai_monitor_stream_active',
  help: 'Currently active streams (started but not yet completed/errored)',
  labelNames: ['app_id'] as const,
  registers: [register],
});

// ---------------------------------------------------------------------------
// JS 错误指标
// ---------------------------------------------------------------------------

export const jsErrors = new Counter({
  name: 'ai_monitor_js_errors_total',
  help: 'Frontend JavaScript errors',
  labelNames: ['app_id', 'error_type'] as const,
  registers: [register],
});

// ---------------------------------------------------------------------------
// HTTP 请求指标
// ---------------------------------------------------------------------------

export const httpDuration = new Histogram({
  name: 'ai_monitor_http_duration_seconds',
  help: 'HTTP request duration (seconds)',
  labelNames: ['app_id', 'method', 'status'] as const,
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 3, 10],
  registers: [register],
});

// ---------------------------------------------------------------------------
// Web Vitals 指标
// ---------------------------------------------------------------------------

export const webVitals = new Gauge({
  name: 'ai_monitor_web_vital_value',
  help: 'Web Vital metric value (latest observation)',
  labelNames: ['app_id', 'metric_name', 'rating'] as const,
  registers: [register],
});

// ---------------------------------------------------------------------------
// 事件处理：将 SDK 事件转换为 Prometheus 指标
// ---------------------------------------------------------------------------

interface MonitorEvent {
  type: string;
  data: Record<string, any>;
  context: Record<string, any>;
}

export function recordEvent(event: MonitorEvent): void {
  const appId = event.context?.appId ?? 'unknown';
  const model = String(event.data?.model ?? 'unknown');
  const provider = String(event.data?.provider ?? 'unknown');
  const d = event.data;

  switch (event.type) {
    case 'stream_start':
      streamActive.inc({ app_id: appId });
      break;

    case 'stream_first_token':
      if (typeof d.ttft === 'number') {
        streamTTFT.observe({ app_id: appId, model, provider }, d.ttft / 1000);
      }
      break;

    case 'stream_complete': {
      streamActive.dec({ app_id: appId });
      const m = String(d.model ?? model);
      const p = String(d.provider ?? provider);
      if (typeof d.ttlb === 'number') {
        streamTTLB.observe({ app_id: appId, model: m, provider: p }, d.ttlb / 1000);
      }
      if (typeof d.tps === 'number') {
        streamTPS.observe({ app_id: appId, model: m, provider: p }, d.tps);
      }
      const usage = d.tokenUsage as Record<string, number> | undefined;
      const promptTokens = usage?.promptTokens ?? d.promptTokens;
      const completionTokens = usage?.completionTokens ?? d.completionTokens;
      if (typeof promptTokens === 'number') {
        streamTokens.inc(
          { app_id: appId, model: m, provider: p, token_type: 'prompt' },
          promptTokens,
        );
      }
      if (typeof completionTokens === 'number') {
        streamTokens.inc(
          { app_id: appId, model: m, provider: p, token_type: 'completion' },
          completionTokens,
        );
      }
      break;
    }

    case 'stream_phase':
      if (d.action === 'end' && typeof d.duration === 'number') {
        streamPhase.observe(
          { app_id: appId, phase: String(d.phase) },
          d.duration / 1000,
        );
      }
      break;

    case 'stream_stall':
      streamStalls.inc({ app_id: appId });
      break;

    case 'stream_error':
      streamActive.dec({ app_id: appId });
      streamErrors.inc({ app_id: appId, model });
      break;

    case 'js_error':
    case 'promise_error':
      jsErrors.inc({ app_id: appId, error_type: event.type });
      break;

    case 'http_request':
      if (typeof d.duration === 'number') {
        httpDuration.observe(
          {
            app_id: appId,
            method: String(d.method ?? 'GET'),
            status: String(d.status ?? 0),
          },
          d.duration / 1000,
        );
      }
      break;

    case 'web_vital':
      if (typeof d.value === 'number') {
        webVitals.set(
          {
            app_id: appId,
            metric_name: String(d.name),
            rating: String(d.rating ?? 'unknown'),
          },
          d.value,
        );
      }
      break;
  }
}
