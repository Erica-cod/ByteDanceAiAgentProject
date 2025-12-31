/**
 * 列出计划 Use Case
 */

import { IPlanRepository } from '../../interfaces/repositories/plan.repository.interface.js';
import { Task } from '../../../domain/entities/plan.entity.js';

export interface ListPlansInput {
  userId: string;
  limit?: number;
}

export interface PlanSummary {
  planId: string;
  title: string;
  goal: string;
  tasks: Task[];
  createdAt: Date;
  updatedAt: Date;
  progress: {
    total: number;
    completed: number;
    percentage: number;
  };
}

export interface ListPlansOutput {
  plans: PlanSummary[];
  total: number;
}

export class ListPlansUseCase {
  constructor(private readonly planRepository: IPlanRepository) {}

  async execute(input: ListPlansInput): Promise<ListPlansOutput> {
    console.log(`📋 [ListPlans] 列出用户计划: ${input.userId}`);

    const result = await this.planRepository.findByUserId(input.userId, input.limit);

    const planSummaries: PlanSummary[] = result.plans.map(plan => ({
      planId: plan.planId,
      title: plan.title,
      goal: plan.goal,
      tasks: plan.tasks,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      progress: plan.getProgress(),
    }));

    console.log(`✅ [ListPlans] 找到 ${result.total} 个计划`);

    return {
      plans: planSummaries,
      total: result.total,
    };
  }
}

