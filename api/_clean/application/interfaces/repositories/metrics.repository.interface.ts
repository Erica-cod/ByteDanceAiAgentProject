/**
 * Metrics Repository Interface - 性能指标仓储接口
 * 
 * 职责：
 * - 定义性能指标数据访问层的契约
 * - 让领域层和应用层不依赖具体的存储实现
 */

import { MetricsEntity } from '../../../domain/entities/metrics.entity.js';

export interface IMetricsRepository {
  /**
   * 获取指标实例（单例）
   * @returns 指标实体
   */
  getInstance(): Promise<MetricsEntity>;

  /**
   * 保存指标
   * @param metrics - 指标实体
   */
  save(metrics: MetricsEntity): Promise<void>;
}

