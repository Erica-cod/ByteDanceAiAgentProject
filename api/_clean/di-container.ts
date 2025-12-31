/**
 * Simple Dependency Injection Container
 * 使用简单的工厂模式，避免 InversifyJS 在 Modern.js ESM 环境下的问题
 * 
 * ⚠️ 重要：延迟初始化，避免 Modern.js BFF 扫描问题
 */

// Import interfaces and implementations - Conversation
import { IConversationRepository } from './application/interfaces/repositories/conversation.repository.interface.js';
import { ConversationRepository } from './infrastructure/repositories/conversation.repository.js';
import { CreateConversationUseCase } from './application/use-cases/conversation/create-conversation.use-case.js';
import { GetConversationsUseCase } from './application/use-cases/conversation/get-conversations.use-case.js';
import { GetConversationUseCase } from './application/use-cases/conversation/get-conversation.use-case.js';
import { UpdateConversationUseCase } from './application/use-cases/conversation/update-conversation.use-case.js';
import { DeleteConversationUseCase } from './application/use-cases/conversation/delete-conversation.use-case.js';

// Import interfaces and implementations - Message
import { IMessageRepository } from './application/interfaces/repositories/message.repository.interface.js';
import { MessageRepository } from './infrastructure/repositories/message.repository.js';
import { CreateMessageUseCase } from './application/use-cases/message/create-message.use-case.js';
import { GetMessagesUseCase } from './application/use-cases/message/get-messages.use-case.js';

// Import interfaces and implementations - User
import { IUserRepository } from './application/interfaces/repositories/user.repository.interface.js';
import { MongoUserRepository } from './infrastructure/repositories/user.repository.js';
import { GetOrCreateUserUseCase } from './application/use-cases/user/get-or-create-user.use-case.js';
import { GetUserByIdUseCase } from './application/use-cases/user/get-user-by-id.use-case.js';
import { UpdateUserUseCase } from './application/use-cases/user/update-user.use-case.js';
import { getDatabase } from '../db/connection.js';

// Import interfaces and implementations - Upload
import { IUploadRepository } from './application/interfaces/repositories/upload.repository.interface.js';
import { FileSystemUploadRepository } from './infrastructure/repositories/upload.repository.js';
import { CreateSessionUseCase } from './application/use-cases/upload/create-session.use-case.js';
import { SaveChunkUseCase } from './application/use-cases/upload/save-chunk.use-case.js';
import { GetSessionStatusUseCase } from './application/use-cases/upload/get-session-status.use-case.js';
import { AssembleChunksUseCase } from './application/use-cases/upload/assemble-chunks.use-case.js';
import { CleanupSessionUseCase } from './application/use-cases/upload/cleanup-session.use-case.js';

// Import interfaces and implementations - Device
import { IDeviceRepository } from './application/interfaces/repositories/device.repository.interface.js';
import { InMemoryDeviceRepository } from './infrastructure/repositories/device.repository.js';
import { TrackDeviceUseCase } from './application/use-cases/device/track-device.use-case.js';
import { GetDeviceStatsUseCase } from './application/use-cases/device/get-device-stats.use-case.js';
import { DeleteDeviceUseCase } from './application/use-cases/device/delete-device.use-case.js';
import { CleanupExpiredDevicesUseCase } from './application/use-cases/device/cleanup-expired-devices.use-case.js';

// Import interfaces and implementations - Metrics
import { IMetricsRepository } from './application/interfaces/repositories/metrics.repository.interface.js';
import { InMemoryMetricsRepository } from './infrastructure/repositories/metrics.repository.js';
import { RecordMetricUseCase } from './application/use-cases/metrics/record-metric.use-case.js';
import { GetMetricsSnapshotUseCase } from './application/use-cases/metrics/get-metrics-snapshot.use-case.js';
import { ResetMetricsUseCase } from './application/use-cases/metrics/reset-metrics.use-case.js';

// Import interfaces and implementations - Memory
import { IMemoryRepository } from './application/interfaces/repositories/memory.repository.interface.js';
import { MongoMemoryRepository } from './infrastructure/repositories/memory.repository.js';
import { GetConversationContextUseCase } from './application/use-cases/memory/get-conversation-context.use-case.js';
import { GetMemoryStatsUseCase } from './application/use-cases/memory/get-memory-stats.use-case.js';

/**
 * 简单的 DI 容器
 */
class SimpleContainer {
  private instances: Map<string, any> = new Map();

  /**
   * 获取或创建 Conversation Repository（单例）
   */
  getConversationRepository(): IConversationRepository {
    if (!this.instances.has('ConversationRepository')) {
      this.instances.set('ConversationRepository', new ConversationRepository());
    }
    return this.instances.get('ConversationRepository');
  }

  /**
   * 创建 CreateConversationUseCase（每次新实例）
   */
  getCreateConversationUseCase(): CreateConversationUseCase {
    const repo = this.getConversationRepository();
    return new CreateConversationUseCase(repo);
  }

  /**
   * 创建 GetConversationsUseCase（每次新实例）
   */
  getGetConversationsUseCase(): GetConversationsUseCase {
    const repo = this.getConversationRepository();
    return new GetConversationsUseCase(repo);
  }

  /**
   * 创建 GetConversationUseCase（每次新实例）
   */
  getGetConversationUseCase(): GetConversationUseCase {
    const repo = this.getConversationRepository();
    return new GetConversationUseCase(repo);
  }

  /**
   * 创建 UpdateConversationUseCase（每次新实例）
   */
  getUpdateConversationUseCase(): UpdateConversationUseCase {
    const repo = this.getConversationRepository();
    return new UpdateConversationUseCase(repo);
  }

  /**
   * 创建 DeleteConversationUseCase（每次新实例）
   */
  getDeleteConversationUseCase(): DeleteConversationUseCase {
    const repo = this.getConversationRepository();
    return new DeleteConversationUseCase(repo);
  }

  // ==================== Message Module ====================

  /**
   * 获取或创建 Message Repository（单例）
   */
  getMessageRepository(): IMessageRepository {
    if (!this.instances.has('MessageRepository')) {
      this.instances.set('MessageRepository', new MessageRepository());
    }
    return this.instances.get('MessageRepository');
  }

  /**
   * 创建 CreateMessageUseCase（每次新实例）
   */
  getCreateMessageUseCase(): CreateMessageUseCase {
    const repo = this.getMessageRepository();
    return new CreateMessageUseCase(repo);
  }

  /**
   * 创建 GetMessagesUseCase（每次新实例）
   */
  getGetMessagesUseCase(): GetMessagesUseCase {
    const repo = this.getMessageRepository();
    return new GetMessagesUseCase(repo);
  }

  // ==================== User Module ====================

  /**
   * 获取或创建 User Repository（单例）
   */
  getUserRepository(): IUserRepository {
    if (!this.instances.has('UserRepository')) {
      this.instances.set('UserRepository', new MongoUserRepository(getDatabase));
    }
    return this.instances.get('UserRepository');
  }

  /**
   * 创建 GetOrCreateUserUseCase（每次新实例）
   */
  getGetOrCreateUserUseCase(): GetOrCreateUserUseCase {
    const repo = this.getUserRepository();
    return new GetOrCreateUserUseCase(repo);
  }

  /**
   * 创建 GetUserByIdUseCase（每次新实例）
   */
  getGetUserByIdUseCase(): GetUserByIdUseCase {
    const repo = this.getUserRepository();
    return new GetUserByIdUseCase(repo);
  }

  /**
   * 创建 UpdateUserUseCase（每次新实例）
   */
  getUpdateUserUseCase(): UpdateUserUseCase {
    const repo = this.getUserRepository();
    return new UpdateUserUseCase(repo);
  }

  // ==================== Upload Module ====================

  /**
   * 获取或创建 Upload Repository（单例）
   */
  getUploadRepository(): IUploadRepository {
    if (!this.instances.has('UploadRepository')) {
      this.instances.set('UploadRepository', new FileSystemUploadRepository());
    }
    return this.instances.get('UploadRepository');
  }

  /**
   * 创建 CreateSessionUseCase（每次新实例）
   */
  getCreateSessionUseCase(): CreateSessionUseCase {
    const repo = this.getUploadRepository();
    return new CreateSessionUseCase(repo);
  }

  /**
   * 创建 SaveChunkUseCase（每次新实例）
   */
  getSaveChunkUseCase(): SaveChunkUseCase {
    const repo = this.getUploadRepository();
    return new SaveChunkUseCase(repo);
  }

  /**
   * 创建 GetSessionStatusUseCase（每次新实例）
   */
  getGetSessionStatusUseCase(): GetSessionStatusUseCase {
    const repo = this.getUploadRepository();
    return new GetSessionStatusUseCase(repo);
  }

  /**
   * 创建 AssembleChunksUseCase（每次新实例）
   */
  getAssembleChunksUseCase(): AssembleChunksUseCase {
    const repo = this.getUploadRepository();
    return new AssembleChunksUseCase(repo);
  }

  /**
   * 创建 CleanupSessionUseCase（每次新实例）
   */
  getCleanupSessionUseCase(): CleanupSessionUseCase {
    const repo = this.getUploadRepository();
    return new CleanupSessionUseCase(repo);
  }

  // ==================== Device Module ====================

  /**
   * 获取或创建 Device Repository（单例）
   */
  getDeviceRepository(): IDeviceRepository {
    if (!this.instances.has('DeviceRepository')) {
      this.instances.set('DeviceRepository', new InMemoryDeviceRepository());
    }
    return this.instances.get('DeviceRepository');
  }

  /**
   * 创建 TrackDeviceUseCase（每次新实例）
   */
  getTrackDeviceUseCase(): TrackDeviceUseCase {
    const repo = this.getDeviceRepository();
    return new TrackDeviceUseCase(repo);
  }

  /**
   * 创建 GetDeviceStatsUseCase（每次新实例）
   */
  getGetDeviceStatsUseCase(): GetDeviceStatsUseCase {
    const repo = this.getDeviceRepository();
    return new GetDeviceStatsUseCase(repo);
  }

  /**
   * 创建 DeleteDeviceUseCase（每次新实例）
   */
  getDeleteDeviceUseCase(): DeleteDeviceUseCase {
    const repo = this.getDeviceRepository();
    return new DeleteDeviceUseCase(repo);
  }

  /**
   * 创建 CleanupExpiredDevicesUseCase（每次新实例）
   */
  getCleanupExpiredDevicesUseCase(): CleanupExpiredDevicesUseCase {
    const repo = this.getDeviceRepository();
    return new CleanupExpiredDevicesUseCase(repo);
  }

  // ==================== Metrics Module ====================

  /**
   * 获取或创建 Metrics Repository（单例）
   */
  getMetricsRepository(): IMetricsRepository {
    if (!this.instances.has('MetricsRepository')) {
      this.instances.set('MetricsRepository', new InMemoryMetricsRepository());
    }
    return this.instances.get('MetricsRepository');
  }

  /**
   * 创建 RecordMetricUseCase（每次新实例）
   */
  getRecordMetricUseCase(): RecordMetricUseCase {
    const repo = this.getMetricsRepository();
    return new RecordMetricUseCase(repo);
  }

  /**
   * 创建 GetMetricsSnapshotUseCase（每次新实例）
   */
  getGetMetricsSnapshotUseCase(): GetMetricsSnapshotUseCase {
    const repo = this.getMetricsRepository();
    return new GetMetricsSnapshotUseCase(repo);
  }

  /**
   * 创建 ResetMetricsUseCase（每次新实例）
   */
  getResetMetricsUseCase(): ResetMetricsUseCase {
    const repo = this.getMetricsRepository();
    return new ResetMetricsUseCase(repo);
  }

  // ==================== Memory Module ====================

  /**
   * 获取或创建 Memory Repository（单例）
   */
  getMemoryRepository(): IMemoryRepository {
    if (!this.instances.has('MemoryRepository')) {
      this.instances.set('MemoryRepository', new MongoMemoryRepository());
    }
    return this.instances.get('MemoryRepository');
  }

  /**
   * 创建 GetConversationContextUseCase（每次新实例）
   */
  getGetConversationContextUseCase(): GetConversationContextUseCase {
    const repo = this.getMemoryRepository();
    return new GetConversationContextUseCase(repo);
  }

  /**
   * 创建 GetMemoryStatsUseCase（每次新实例）
   */
  getGetMemoryStatsUseCase(): GetMemoryStatsUseCase {
    const repo = this.getMemoryRepository();
    return new GetMemoryStatsUseCase(repo);
  }
}

let container: SimpleContainer | null = null;

/**
 * 获取容器实例（延迟初始化）
 */
export function getContainer(): SimpleContainer {
  if (!container) {
    container = new SimpleContainer();
    console.log('✅ Simple DI Container initialized');
  }
  return container;
}

