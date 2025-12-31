/**
 * 创建计划 Use Case
 */

import { IPlanRepository } from '../../interfaces/repositories/plan.repository.interface.js';
import { PlanEntity, Task } from '../../../domain/entities/plan.entity.js';

export interface CreatePlanInput {
  userId: string;
  title: string;
  goal: string;
  tasks: Task[];
}

export interface CreatePlanOutput {
  planId: string;
  title: string;
  goal: string;
  tasks: Task[];
  createdAt: Date;
}

export class CreatePlanUseCase {
  constructor(private readonly planRepository: IPlanRepository) {}

  async execute(input: CreatePlanInput): Promise<CreatePlanOutput> {
    console.log(`📋 [CreatePlan] 创建计划: "${input.title}"`);

    // 创建计划实体
    const planEntity = PlanEntity.create({
      userId: input.userId,
      title: input.title,
      goal: input.goal,
      tasks: input.tasks,
    });

    // 保存到仓储
    const savedPlan = await this.planRepository.save(planEntity);

    console.log(`✅ [CreatePlan] 计划已创建: ${savedPlan.planId}`);

    return {
      planId: savedPlan.planId,
      title: savedPlan.title,
      goal: savedPlan.goal,
      tasks: savedPlan.tasks,
      createdAt: savedPlan.createdAt,
    };
  }
}

