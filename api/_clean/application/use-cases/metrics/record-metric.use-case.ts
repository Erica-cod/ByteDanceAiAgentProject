/**
 * Record Metric Use Case - 记录性能指标用例
 * 
 * 职责：
 * - 协调记录各类性能指标的业务流程
 * - 调用仓储层获取指标实例
 * - 执行指标记录操作
 */

import { IMetricsRepository } from '../../interfaces/repositories/metrics.repository.interface.js';

export type MetricType = 
  | 'sse_connection'
  | 'sse_disconnection'
  | 'sse_error'
  | 'db_query'
  | 'db_error'
  | 'llm_request'
  | 'llm_error'
  | 'tool_call'
  | 'tool_call_error';

export interface RecordMetricParams {
  type: MetricType;
  durationMs?: number;
  tokensUsed?: number;
}

export class RecordMetricUseCase {
  constructor(private metricsRepository: IMetricsRepository) {}

  /**
   * 执行记录指标
   * @param params - 指标参数
   */
  async execute(params: RecordMetricParams): Promise<void> {
    try {
      const metrics = await this.metricsRepository.getInstance();

      switch (params.type) {
        case 'sse_connection':
          metrics.recordSSEConnection();
          break;
        case 'sse_disconnection':
          metrics.recordSSEDisconnection();
          break;
        case 'sse_error':
          metrics.recordSSEError();
          break;
        case 'db_query':
          if (params.durationMs !== undefined) {
            metrics.recordDBQuery(params.durationMs);
          }
          break;
        case 'db_error':
          metrics.recordDBError();
          break;
        case 'llm_request':
          if (params.durationMs !== undefined) {
            metrics.recordLLMRequest(params.durationMs, params.tokensUsed);
          }
          break;
        case 'llm_error':
          metrics.recordLLMError();
          break;
        case 'tool_call':
          metrics.recordToolCall();
          break;
        case 'tool_call_error':
          metrics.recordToolCallError();
          break;
      }

      await this.metricsRepository.save(metrics);
    } catch (error) {
      console.error('❌ Record metric error:', error);
      // 不抛出错误，避免影响主业务流程
    }
  }
}

