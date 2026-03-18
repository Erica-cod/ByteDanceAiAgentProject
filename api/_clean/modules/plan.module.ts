import { IPlanRepository } from '../application/interfaces/repositories/plan.repository.interface.js';
import { MongoPlanRepository } from '../infrastructure/repositories/plan.repository.js';
import { CreatePlanUseCase } from '../application/use-cases/plan/create-plan.use-case.js';
import { UpdatePlanUseCase } from '../application/use-cases/plan/update-plan.use-case.js';
import { GetPlanUseCase } from '../application/use-cases/plan/get-plan.use-case.js';
import { ListPlansUseCase } from '../application/use-cases/plan/list-plans.use-case.js';
import { DeletePlanUseCase } from '../application/use-cases/plan/delete-plan.use-case.js';

export class PlanModule {
  constructor(private instances: Map<string, any>) {}

  getPlanRepository(): IPlanRepository {
    if (!this.instances.has('PlanRepository')) {
      this.instances.set('PlanRepository', new MongoPlanRepository());
    }
    return this.instances.get('PlanRepository');
  }

  getCreatePlanUseCase() { return new CreatePlanUseCase(this.getPlanRepository()); }
  getUpdatePlanUseCase() { return new UpdatePlanUseCase(this.getPlanRepository()); }
  getGetPlanUseCase() { return new GetPlanUseCase(this.getPlanRepository()); }
  getListPlansUseCase() { return new ListPlansUseCase(this.getPlanRepository()); }
  getDeletePlanUseCase() { return new DeletePlanUseCase(this.getPlanRepository()); }
}
