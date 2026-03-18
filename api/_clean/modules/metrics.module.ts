import { IMetricsRepository } from '../application/interfaces/repositories/metrics.repository.interface.js';
import { InMemoryMetricsRepository } from '../infrastructure/repositories/metrics.repository.js';
import { RecordMetricUseCase } from '../application/use-cases/metrics/record-metric.use-case.js';
import { GetMetricsSnapshotUseCase } from '../application/use-cases/metrics/get-metrics-snapshot.use-case.js';
import { ResetMetricsUseCase } from '../application/use-cases/metrics/reset-metrics.use-case.js';

export class MetricsModule {
  constructor(private instances: Map<string, any>) {}

  getMetricsRepository(): IMetricsRepository {
    if (!this.instances.has('MetricsRepository')) {
      this.instances.set('MetricsRepository', new InMemoryMetricsRepository());
    }
    return this.instances.get('MetricsRepository');
  }

  getRecordMetricUseCase() { return new RecordMetricUseCase(this.getMetricsRepository()); }
  getGetMetricsSnapshotUseCase() { return new GetMetricsSnapshotUseCase(this.getMetricsRepository()); }
  getResetMetricsUseCase() { return new ResetMetricsUseCase(this.getMetricsRepository()); }
}
