/**
 * 获取计划 Use Case
 */

import { IPlanRepository } from '../../interfaces/repositories/plan.repository.interface.js';
import { Task } from '../../../domain/entities/plan.entity.js';

export interface GetPlanInput {
  planId: string;
  userId: string;
}

export interface GetPlanOutput {
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

export class GetPlanUseCase {
  constructor(private readonly planRepository: IPlanRepository) {}

  async execute(input: GetPlanInput): Promise<GetPlanOutput | null> {
    console.log(`📋 [GetPlan] 获取计划: ${input.planId}`);

    const plan = await this.planRepository.findById(input.planId, input.userId);

    if (!plan) {
      console.warn(`⚠️ [GetPlan] 计划不存在: ${input.planId}`);
      return null;
    }

    return {
      planId: plan.planId,
      title: plan.title,
      goal: plan.goal,
      tasks: plan.tasks,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      progress: plan.getProgress(),
    };
  }
}

