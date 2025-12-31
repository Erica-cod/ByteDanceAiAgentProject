/**
 * Conversations API - 符合 Modern.js BFF 规范
 * 路由: /api/conversations
 * 
 * 🔄 重构策略：双轨并行
 * - 默认使用旧架构（ConversationService）
 * - 通过 USE_CLEAN_ARCH=true 切换到新架构（Clean Architecture）
 */

// 加载环境变量
import '../config/env.js';
import type { RequestOption } from '../types/chat.js';
import { connectToDatabase } from '../db/connection.js';

// 旧架构
import { ConversationService } from '../services/conversationService.js';

// 新架构（Clean Architecture）
import { getContainer } from '../_clean/di-container.js';

// 工具
import { successResponse, errorResponse } from './_utils/response.js';
import { USE_CLEAN_ARCH } from './_utils/arch-switch.js';

// Initialize database connection
connectToDatabase().catch(console.error);

// ============= 类型定义 =============

interface CreateConversationData {
  userId: string;
  title?: string;
}

interface GetConversationsQuery {
  userId: string;
  limit?: string;
  skip?: string;
}

// ============= API 函数 =============

/**
 * POST /api/conversations - 创建新对话
 * 
 * @param data - 请求数据 { userId, title? }
 * @returns 创建的对话信息
 */
export async function post({
  data,
}: RequestOption<any, CreateConversationData>) {
  try {
    const { userId, title } = data;

    // 参数验证
    if (!userId) {
      return errorResponse('userId is required');
    }

    let conversation;

    if (USE_CLEAN_ARCH) {
      // 🆕 使用新的 Clean Architecture
      console.log('🆕 Using Clean Architecture for create conversation');
      const container = getContainer();
      const useCase = container.getCreateConversationUseCase();
      const entity = await useCase.execute(userId, title);
      conversation = entity.toPersistence();
    } else {
      // ✅ 使用旧的 Service（默认）
      console.log('✅ Using Legacy Service for create conversation');
      conversation = await ConversationService.createConversation(userId, title);
    }

    return successResponse({ conversation });
  } catch (error: any) {
    console.error('❌ Create conversation error:', error);
    return errorResponse(error.message || 'Failed to create conversation');
  }
}

/**
 * GET /api/conversations - 获取用户的对话列表
 * 
 * @param query - 查询参数 { userId, limit?, skip? }
 * @returns 对话列表和总数
 */
export async function get({
  query,
}: RequestOption<GetConversationsQuery, any>) {
  try {
    const { userId, limit = '20', skip = '0' } = query;

    // 参数验证
    if (!userId) {
      return errorResponse('userId is required');
    }

    let result;

    if (USE_CLEAN_ARCH) {
      // 🆕 使用新的 Clean Architecture
      console.log('🆕 Using Clean Architecture for get conversations');
      const container = getContainer();
      const useCase = container.getGetConversationsUseCase();
      const useCaseResult = await useCase.execute(
        userId,
        parseInt(limit, 10),
        parseInt(skip, 10)
      );
      
      // 转换为旧格式（保持 API 兼容性）
      result = {
        conversations: useCaseResult.conversations.map(entity => entity.toPersistence()),
        total: useCaseResult.total
      };
    } else {
      // ✅ 使用旧的 Service（默认）
      console.log('✅ Using Legacy Service for get conversations');
      result = await ConversationService.getUserConversations(
        userId,
        parseInt(limit, 10),
        parseInt(skip, 10)
      );
    }

    return successResponse({
      conversations: result.conversations,
      total: result.total
    });
  } catch (error: any) {
    console.error('❌ Get conversations error:', error);
    return errorResponse(error.message || 'Failed to get conversations');
  }
}

