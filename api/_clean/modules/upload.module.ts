import { IUploadRepository } from '../application/interfaces/repositories/upload.repository.interface.js';
import { FileSystemUploadRepository } from '../infrastructure/repositories/upload.repository.js';
import { CreateSessionUseCase } from '../application/use-cases/upload/create-session.use-case.js';
import { SaveChunkUseCase } from '../application/use-cases/upload/save-chunk.use-case.js';
import { GetSessionStatusUseCase } from '../application/use-cases/upload/get-session-status.use-case.js';
import { AssembleChunksUseCase } from '../application/use-cases/upload/assemble-chunks.use-case.js';
import { CleanupSessionUseCase } from '../application/use-cases/upload/cleanup-session.use-case.js';

export class UploadModule {
  constructor(private instances: Map<string, any>) {}

  getUploadRepository(): IUploadRepository {
    if (!this.instances.has('UploadRepository')) {
      this.instances.set('UploadRepository', new FileSystemUploadRepository());
    }
    return this.instances.get('UploadRepository');
  }

  getCreateSessionUseCase() { return new CreateSessionUseCase(this.getUploadRepository()); }
  getSaveChunkUseCase() { return new SaveChunkUseCase(this.getUploadRepository()); }
  getGetSessionStatusUseCase() { return new GetSessionStatusUseCase(this.getUploadRepository()); }
  getAssembleChunksUseCase() { return new AssembleChunksUseCase(this.getUploadRepository()); }
  getCleanupSessionUseCase() { return new CleanupSessionUseCase(this.getUploadRepository()); }
}
