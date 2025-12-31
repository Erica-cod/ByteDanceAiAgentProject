/**
 * 更新计划 Use Case
 */

import { IPlanRepository } from '../../interfaces/repositories/plan.repository.interface.js';
import { Task } from '../../../domain/entities/plan.entity.js';

export interface UpdatePlanInput {
  planId: string;
  userId: string;
  title?: string;
  goal?: string;
  tasks?: Task[];
}

export interface UpdatePlanOutput {
  planId: string;
  title: string;
  goal: string;
  tasks: Task[];
  updatedAt: Date;
}

export class UpdatePlanUseCase {
  constructor(private readonly planRepository: IPlanRepository) {}

  async execute(input: UpdatePlanInput): Promise<UpdatePlanOutput | null> {
    console.log(`📋 [UpdatePlan] 更新计划: ${input.planId}`);

    // 查找现有计划
    const existingPlan = await this.planRepository.findById(input.planId, input.userId);

    if (!existingPlan) {
      console.warn(`⚠️ [UpdatePlan] 计划不存在或无权限: ${input.planId}`);
      return null;
    }

    // 更新计划
    const updatedPlan = existingPlan.update({
      title: input.title,
      goal: input.goal,
      tasks: input.tasks,
    });

    // 保存更新
    const savedPlan = await this.planRepository.save(updatedPlan);

    console.log(`✅ [UpdatePlan] 计划已更新: ${savedPlan.planId}`);

    return {
      planId: savedPlan.planId,
      title: savedPlan.title,
      goal: savedPlan.goal,
      tasks: savedPlan.tasks,
      updatedAt: savedPlan.updatedAt,
    };
  }
}

