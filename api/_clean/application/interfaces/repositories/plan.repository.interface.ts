/**
 * 计划仓储接口
 * 
 * 定义计划的数据访问方法
 */

import { PlanEntity } from '../../../domain/entities/plan.entity.js';

/**
 * 计划列表响应
 */
export interface PlanListResult {
  plans: PlanEntity[];
  total: number;
}

/**
 * 计划仓储接口
 */
export interface IPlanRepository {
  /**
   * 保存计划（创建或更新）
   */
  save(plan: PlanEntity): Promise<PlanEntity>;

  /**
   * 根据 ID 查找计划
   */
  findById(planId: string, userId: string): Promise<PlanEntity | null>;

  /**
   * 列出用户的所有活跃计划
   */
  findByUserId(userId: string, limit?: number): Promise<PlanListResult>;

  /**
   * 删除计划（软删除）
   */
  delete(planId: string, userId: string): Promise<boolean>;
}

