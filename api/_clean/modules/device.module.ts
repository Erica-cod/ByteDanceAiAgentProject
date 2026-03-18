import { IDeviceRepository } from '../application/interfaces/repositories/device.repository.interface.js';
import { InMemoryDeviceRepository } from '../infrastructure/repositories/device.repository.js';
import { TrackDeviceUseCase } from '../application/use-cases/device/track-device.use-case.js';
import { GetDeviceStatsUseCase } from '../application/use-cases/device/get-device-stats.use-case.js';
import { DeleteDeviceUseCase } from '../application/use-cases/device/delete-device.use-case.js';
import { CleanupExpiredDevicesUseCase } from '../application/use-cases/device/cleanup-expired-devices.use-case.js';

export class DeviceModule {
  constructor(private instances: Map<string, any>) {}

  getDeviceRepository(): IDeviceRepository {
    if (!this.instances.has('DeviceRepository')) {
      this.instances.set('DeviceRepository', new InMemoryDeviceRepository());
    }
    return this.instances.get('DeviceRepository');
  }

  getTrackDeviceUseCase() { return new TrackDeviceUseCase(this.getDeviceRepository()); }
  getGetDeviceStatsUseCase() { return new GetDeviceStatsUseCase(this.getDeviceRepository()); }
  getDeleteDeviceUseCase() { return new DeleteDeviceUseCase(this.getDeviceRepository()); }

  /** 单例：防止创建多个定期清理任务 */
  getCleanupExpiredDevicesUseCase(): CleanupExpiredDevicesUseCase {
    if (!this.instances.has('CleanupExpiredDevicesUseCase')) {
      this.instances.set('CleanupExpiredDevicesUseCase', new CleanupExpiredDevicesUseCase(this.getDeviceRepository()));
    }
    return this.instances.get('CleanupExpiredDevicesUseCase');
  }
}
