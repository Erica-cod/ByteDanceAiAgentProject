/**
 * Simple Dependency Injection Container
 * 使用简单的工厂模式，避免 InversifyJS 在 Modern.js ESM 环境下的问题
 *
 * ⚠️ 重要：延迟初始化，避免 Modern.js BFF 扫描问题
 *
 * 各领域模块的 Repository 单例 + UseCase 工厂实现已拆分到 modules/ 目录，
 * 本文件仅做组合与向后兼容委托。
 */

import { ConversationModule } from './modules/conversation.module.js';
import { MessageModule } from './modules/message.module.js';
import { UserModule } from './modules/user.module.js';
import { UploadModule } from './modules/upload.module.js';
import { DeviceModule } from './modules/device.module.js';
import { MetricsModule } from './modules/metrics.module.js';
import { MemoryModule } from './modules/memory.module.js';
import { PlanModule } from './modules/plan.module.js';
import { AgentSessionModule } from './modules/agent-session.module.js';
import { RequestCacheModule } from './modules/request-cache.module.js';
import { StreamProgressModule } from './modules/stream-progress.module.js';
import { ProcessLongTextAnalysisUseCase } from './application/use-cases/text-analysis/process-long-text-analysis.use-case.js';

/**
 * 简单的 DI 容器
 */
class SimpleContainer {
  private instances: Map<string, any> = new Map();

  // ── 领域模块 ──
  readonly conversation = new ConversationModule(this.instances);
  readonly message = new MessageModule(this.instances);
  readonly user = new UserModule(this.instances);
  readonly upload = new UploadModule(this.instances);
  readonly device = new DeviceModule(this.instances);
  readonly metrics = new MetricsModule(this.instances);
  readonly memory = new MemoryModule(this.instances);
  readonly plan = new PlanModule(this.instances);
  readonly agentSession = new AgentSessionModule(this.instances);
  readonly requestCache = new RequestCacheModule(this.instances);
  readonly streamProgress = new StreamProgressModule(this.instances);

  // ==================== Conversation ====================
  getConversationRepository() { return this.conversation.getConversationRepository(); }
  getCreateConversationUseCase() { return this.conversation.getCreateConversationUseCase(); }
  getGetConversationsUseCase() { return this.conversation.getGetConversationsUseCase(); }
  getGetConversationUseCase() { return this.conversation.getGetConversationUseCase(); }
  getUpdateConversationUseCase() { return this.conversation.getUpdateConversationUseCase(); }
  getDeleteConversationUseCase() { return this.conversation.getDeleteConversationUseCase(); }
  getArchiveConversationUseCase() { return this.conversation.getArchiveConversationUseCase(); }
  getUnarchiveConversationUseCase() { return this.conversation.getUnarchiveConversationUseCase(); }
  getGetArchivedConversationsUseCase() { return this.conversation.getGetArchivedConversationsUseCase(); }

  // ==================== Message ====================
  getMessageRepository() { return this.message.getMessageRepository(); }
  getCreateMessageUseCase() { return this.message.getCreateMessageUseCase(); }
  getGetMessagesUseCase() { return this.message.getGetMessagesUseCase(); }
  getGetMessageContentRangeUseCase() { return this.message.getGetMessageContentRangeUseCase(); }

  // ==================== User ====================
  getUserRepository() { return this.user.getUserRepository(); }
  getGetOrCreateUserUseCase() { return this.user.getGetOrCreateUserUseCase(); }
  getGetUserByIdUseCase() { return this.user.getGetUserByIdUseCase(); }
  getUpdateUserUseCase() { return this.user.getUpdateUserUseCase(); }

  // ==================== Upload ====================
  getUploadRepository() { return this.upload.getUploadRepository(); }
  getCreateSessionUseCase() { return this.upload.getCreateSessionUseCase(); }
  getSaveChunkUseCase() { return this.upload.getSaveChunkUseCase(); }
  getGetSessionStatusUseCase() { return this.upload.getGetSessionStatusUseCase(); }
  getAssembleChunksUseCase() { return this.upload.getAssembleChunksUseCase(); }
  getCleanupSessionUseCase() { return this.upload.getCleanupSessionUseCase(); }

  // ==================== Device ====================
  getDeviceRepository() { return this.device.getDeviceRepository(); }
  getTrackDeviceUseCase() { return this.device.getTrackDeviceUseCase(); }
  getGetDeviceStatsUseCase() { return this.device.getGetDeviceStatsUseCase(); }
  getDeleteDeviceUseCase() { return this.device.getDeleteDeviceUseCase(); }
  getCleanupExpiredDevicesUseCase() { return this.device.getCleanupExpiredDevicesUseCase(); }

  // ==================== Metrics ====================
  getMetricsRepository() { return this.metrics.getMetricsRepository(); }
  getRecordMetricUseCase() { return this.metrics.getRecordMetricUseCase(); }
  getGetMetricsSnapshotUseCase() { return this.metrics.getGetMetricsSnapshotUseCase(); }
  getResetMetricsUseCase() { return this.metrics.getResetMetricsUseCase(); }

  // ==================== Memory ====================
  getMemoryRepository() { return this.memory.getMemoryRepository(); }
  getGetConversationContextUseCase() { return this.memory.getGetConversationContextUseCase(); }
  getGetMemoryStatsUseCase() { return this.memory.getGetMemoryStatsUseCase(); }

  // ==================== Plan ====================
  getPlanRepository() { return this.plan.getPlanRepository(); }
  getCreatePlanUseCase() { return this.plan.getCreatePlanUseCase(); }
  getUpdatePlanUseCase() { return this.plan.getUpdatePlanUseCase(); }
  getGetPlanUseCase() { return this.plan.getGetPlanUseCase(); }
  getListPlansUseCase() { return this.plan.getListPlansUseCase(); }
  getDeletePlanUseCase() { return this.plan.getDeletePlanUseCase(); }

  // ==================== Agent Session ====================
  getAgentSessionRepository() { return this.agentSession.getAgentSessionRepository(); }
  getSaveSessionUseCase() { return this.agentSession.getSaveSessionUseCase(); }
  getLoadSessionUseCase() { return this.agentSession.getLoadSessionUseCase(); }
  getDeleteSessionUseCase() { return this.agentSession.getDeleteSessionUseCase(); }
  getCleanExpiredSessionsUseCase() { return this.agentSession.getCleanExpiredSessionsUseCase(); }
  getGetSessionStatsUseCase() { return this.agentSession.getGetSessionStatsUseCase(); }
  ensureAgentSessionIndexes() { return this.agentSession.ensureAgentSessionIndexes(); }

  // ==================== Text Analysis ====================
  getProcessLongTextAnalysisUseCase() { return new ProcessLongTextAnalysisUseCase(); }

  // ==================== Request Cache ====================
  getRequestCacheRepository() { return this.requestCache.getRequestCacheRepository(); }
  getFindSimilarCachedRequestUseCase() { return this.requestCache.getFindSimilarCachedRequestUseCase(); }
  getSaveRequestCacheUseCase() { return this.requestCache.getSaveRequestCacheUseCase(); }
  getGetCachedResponseUseCase() { return this.requestCache.getGetCachedResponseUseCase(); }
  getCleanupExpiredCachesUseCase() { return this.requestCache.getCleanupExpiredCachesUseCase(); }
  getGetCacheStatsUseCase() { return this.requestCache.getGetCacheStatsUseCase(); }
  ensureRequestCacheIndexes() { return this.requestCache.ensureRequestCacheIndexes(); }

  // ==================== Stream Progress ====================
  getStreamProgressRepository() { return this.streamProgress.getStreamProgressRepository(); }
  ensureStreamProgressIndexes() { return this.streamProgress.ensureStreamProgressIndexes(); }
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
