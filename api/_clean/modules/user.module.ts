import { IUserRepository } from '../application/interfaces/repositories/user.repository.interface.js';
import { MongoUserRepository } from '../infrastructure/repositories/user.repository.js';
import { GetOrCreateUserUseCase } from '../application/use-cases/user/get-or-create-user.use-case.js';
import { GetUserByIdUseCase } from '../application/use-cases/user/get-user-by-id.use-case.js';
import { UpdateUserUseCase } from '../application/use-cases/user/update-user.use-case.js';
import { getDatabase } from '../../db/connection.js';

export class UserModule {
  constructor(private instances: Map<string, any>) {}

  getUserRepository(): IUserRepository {
    if (!this.instances.has('UserRepository')) {
      this.instances.set('UserRepository', new MongoUserRepository(getDatabase));
    }
    return this.instances.get('UserRepository');
  }

  getGetOrCreateUserUseCase() { return new GetOrCreateUserUseCase(this.getUserRepository()); }
  getGetUserByIdUseCase() { return new GetUserByIdUseCase(this.getUserRepository()); }
  getUpdateUserUseCase() { return new UpdateUserUseCase(this.getUserRepository()); }
}
