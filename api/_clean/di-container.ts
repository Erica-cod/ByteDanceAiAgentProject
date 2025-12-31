/**
 * Simple Dependency Injection Container
 * 使用简单的工厂模式，避免 InversifyJS 在 Modern.js ESM 环境下的问题
 * 
 * ⚠️ 重要：延迟初始化，避免 Modern.js BFF 扫描问题
 */

// Import interfaces and implementations
import { IConversationRepository } from './application/interfaces/repositories/conversation.repository.interface.js';
import { ConversationRepository } from './infrastructure/repositories/conversation.repository.js';
import { CreateConversationUseCase } from './application/use-cases/conversation/create-conversation.use-case.js';
import { GetConversationsUseCase } from './application/use-cases/conversation/get-conversations.use-case.js';

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

