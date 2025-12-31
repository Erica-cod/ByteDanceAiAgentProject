/**
 * In-Memory Metrics Repository Implementation - 性能指标仓储内存实现
 * 
 * 职责：
 * - 使用内存存储性能指标数据（单例模式）
 * - 管理指标实体的生命周期
 */

import { IMetricsRepository } from '../../application/interfaces/repositories/metrics.repository.interface.js';
import { MetricsEntity } from '../../domain/entities/metrics.entity.js';

export class InMemoryMetricsRepository implements IMetricsRepository {
  private metricsInstance: MetricsEntity | null = null;

  /**
   * 获取指标实例（单例）
   */
  async getInstance(): Promise<MetricsEntity> {
    if (!this.metricsInstance) {
      const isEnabled = process.env.ENABLE_PERFORMANCE_MONITORING !== 'false';
      this.metricsInstance = MetricsEntity.create(isEnabled);
      
      if (isEnabled) {
        console.log('📊 Performance monitoring enabled');
      }
    }
    return this.metricsInstance;
  }

  /**
   * 保存指标（实际上是更新内存中的单例）
   */
  async save(metrics: MetricsEntity): Promise<void> {
    this.metricsInstance = metrics;
  }
}

