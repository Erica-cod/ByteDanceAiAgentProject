/**
 * 删除计划 Use Case
 */

import { IPlanRepository } from '../../interfaces/repositories/plan.repository.interface.js';

export interface DeletePlanInput {
  planId: string;
  userId: string;
}

export interface DeletePlanOutput {
  success: boolean;
}

export class DeletePlanUseCase {
  constructor(private readonly planRepository: IPlanRepository) {}

  async execute(input: DeletePlanInput): Promise<DeletePlanOutput> {
    console.log(`📋 [DeletePlan] 删除计划: ${input.planId}`);

    const success = await this.planRepository.delete(input.planId, input.userId);

    if (success) {
      console.log(`✅ [DeletePlan] 计划已删除: ${input.planId}`);
    } else {
      console.warn(`⚠️ [DeletePlan] 计划不存在: ${input.planId}`);
    }

    return { success };
  }
}

