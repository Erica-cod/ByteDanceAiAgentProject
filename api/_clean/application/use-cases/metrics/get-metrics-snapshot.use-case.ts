/**
 * Get Metrics Snapshot Use Case - 获取指标快照用例
 * 
 * 职责：
 * - 协调获取性能指标快照的业务流程
 * - 返回格式化的指标数据
 * 
 * 使用 @Service 和 @Inject 装饰器实现依赖注入
 */

import { Service, Inject } from '../../../shared/decorators/index.js';
import { IMetricsRepository } from '../../interfaces/repositories/metrics.repository.interface.js';

export interface MetricsSnapshot {
  sse: {
    active: number;
    total: number;
    errors: number;
    errorRate: string;
  };
  database: {
    queries: number;
    avgTime: string;
    errors: number;
  };
  llm: {
    requests: number;
    avgTime: string;
    tokensUsed: number;
    errors: number;
  };
  tools: {
    calls: number;
    errors: number;
  };
  memory: {
    heapUsed: string;
    heapTotal: string;
    usage: string;
  };
}

@Service() // 使用装饰器标记为可注入的服务
@Inject(['IMetricsRepository']) // 声明依赖的 token 数组
export class GetMetricsSnapshotUseCase {
  constructor(
    private metricsRepository: IMetricsRepository
  ) {}

  /**
   * 执行获取指标快照
   * @returns 指标快照
   */
  async execute(): Promise<MetricsSnapshot> {
    try {
      const metrics = await this.metricsRepository.getInstance();
      
      // 更新内存使用信息
      metrics.updateMemoryUsage();
      await this.metricsRepository.save(metrics);

      const mem = metrics.memoryUsage;
      const dbAvgTime = metrics.getDBAvgTime();
      const llmAvgTime = metrics.getLLMAvgTime();
      const sseErrorRate = metrics.getSSEErrorRate();

      return {
        sse: {
          active: metrics.activeSSEConnections,
          total: metrics.sseConnectionsTotal,
          errors: metrics.sseConnectionErrors,
          errorRate: (sseErrorRate * 100).toFixed(2) + '%',
        },
        database: {
          queries: metrics.dbQueryCount,
          avgTime: dbAvgTime.toFixed(1) + 'ms',
          errors: metrics.dbErrors,
        },
        llm: {
          requests: metrics.llmRequestCount,
          avgTime: (llmAvgTime / 1000).toFixed(1) + 's',
          tokensUsed: metrics.llmTokensUsed,
          errors: metrics.llmErrors,
        },
        tools: {
          calls: metrics.toolCallCount,
          errors: metrics.toolCallErrors,
        },
        memory: {
          heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(1) + 'MB',
          heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(1) + 'MB',
          usage: metrics.getMemoryUsagePercent().toFixed(1) + '%',
        },
      };
    } catch (error) {
      console.error('❌ Get metrics snapshot error:', error);
      throw error;
    }
  }
}

