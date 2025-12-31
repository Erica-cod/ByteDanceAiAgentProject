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

