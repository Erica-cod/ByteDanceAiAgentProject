/**
 * Reset Metrics Use Case - 重置指标用例
 * 
 * 职责：
 * - 协调重置性能指标的业务流程
 * - 清空所有指标数据
 */

import { IMetricsRepository } from '../../interfaces/repositories/metrics.repository.interface.js';

export class ResetMetricsUseCase {
  constructor(private metricsRepository: IMetricsRepository) {}

  /**
   * 执行重置指标
   */
  async execute(): Promise<void> {
    try {
      console.log('🔄 Resetting metrics...');

      const metrics = await this.metricsRepository.getInstance();
      metrics.reset();
      await this.metricsRepository.save(metrics);

      console.log('✅ Metrics reset successfully');
    } catch (error) {
      console.error('❌ Reset metrics error:', error);
      throw error;
    }
  }
}

