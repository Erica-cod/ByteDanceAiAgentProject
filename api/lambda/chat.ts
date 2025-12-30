/**
 * Chat API - 符合 Modern.js BFF 规范
 * 路由: /api/chat
 * 
 * 支持流式响应 (SSE)
 * 
 * ✅ 重构后：路由层只负责参数验证、并发控制、路由分发
 * ✅ 具体逻辑已拆分到独立模块
 */

// 加载环境变量
import '../config/env.js';
import { connectToDatabase } from '../db/connection.js';
import { ConversationService } from '../services/conversationService.js';
import { MessageService } from '../services/messageService.js';
import { UserService } from '../services/userService.js';
import { errorResponse } from './_utils/response.js';
import { acquireSSESlot } from '../services/sseLimiter.js';
import { ConversationMemoryService } from '../services/conversationMemoryService.js';
import { getRecommendedConfig } from '../config/memoryConfig.js';
import { SYSTEM_PROMPT } from '../config/systemPrompt.js';
import { callLocalModel, callVolcengineModel } from '../services/modelService.js';
import { volcengineService } from '../services/volcengineService.js';
import { handleMultiAgentMode } from '../handlers/multiAgentHandler.js';
import { handleVolcanoStream, handleLocalStream } from '../handlers/singleAgentHandler.js';
import { handleChunkingPlanReview } from '../services/chunkingPlanReviewService.js';
import { SSEStreamWriter } from '../utils/sseStreamWriter.js';
import type { ChatRequestData, RequestOption } from '../types/chat.js';

// 初始化数据库连接
connectToDatabase().catch(console.error);

/**
 * 统一返回 429（用于限流/并发限制）+ 队列信息
 */
function tooManyRequests(
  message: string,
  retryAfterSec: number,
  queueToken?: string,
  queuePosition?: number,
  estimatedWaitSec?: number
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Retry-After': String(retryAfterSec),
  };

  if (queueToken) headers['X-Queue-Token'] = queueToken;
  if (queuePosition !== undefined) headers['X-Queue-Position'] = String(queuePosition);
  if (estimatedWaitSec !== undefined) headers['X-Queue-Estimated-Wait'] = String(estimatedWaitSec);

  return new Response(JSON.stringify({ success: false, error: message }), {
    status: 429,
    headers,
  });
}

/**
 * POST /api/chat - 发送聊天消息（流式响应）
 */
export async function post({
  data,
}: RequestOption<any, ChatRequestData>) {
  try {
    console.log('=== 收到聊天请求 ===');
    
    const {
      message,
      modelType,
      conversationId: reqConversationId,
      userId,
      deviceId,
      mode,
      clientUserMessageId,
      clientAssistantMessageId,
      queueToken,
    } = data;

    console.log('解析后的 message:', message);
    console.log('解析后的 modelType:', modelType);
    console.log('解析后的 conversationId:', reqConversationId);
    console.log('解析后的 userId:', userId);
    console.log('解析后的 deviceId:', deviceId || '未提供（降级到 userId)');
    console.log('解析后的 mode:', mode || 'single');

    // ==================== 参数验证 ====================
    if (!message || !message.trim()) {
      console.log('消息内容为空');
      return errorResponse('消息内容不能为空');
    }

    if (!userId) {
      return errorResponse('userId is required');
    }

    // ==================== 并发限制（SSE长连接占位）====================
    const identityId = deviceId || userId;
    const slot = acquireSSESlot(identityId, queueToken);
    
    if (slot.ok === false) {
      console.warn('⚠️  SSE 并发限制触发，已加入队列:', slot);
      return tooManyRequests(
        slot.reason,
        slot.retryAfterSec,
        slot.queueToken,
        slot.queuePosition,
        slot.estimatedWaitSec
      );
    }

    // 是否已把 release"交接"给流式处理
    let handoffToStream = false;

    try {
      // 确保用户存在
      await UserService.getOrCreateUser(userId);

      // 如果没有 conversationId，创建新对话
      let conversationId = reqConversationId;
      if (!conversationId) {
        const conversation = await ConversationService.createConversation(
          userId,
          message.slice(0, 50) + (message.length > 50 ? '...' : '')
        );
        conversationId = conversation.conversationId;
        console.log('✅ Created new conversation:', conversationId);
      }

      // 保存用户消息到数据库
      try {
        await MessageService.addMessage(
          conversationId,
          userId,
          'user',
          message,
          clientUserMessageId,
          undefined,
          modelType
        );
        await ConversationService.incrementMessageCount(conversationId, userId);
        console.log('✅ User message saved to database');
      } catch (dbError) {
        console.error('❌ Failed to save user message:', dbError);
        // 继续处理，不阻止 AI 回复
      }

      // ==================== 超长文本 Chunking 模式 ====================
      const { longTextMode, longTextOptions } = data;
      
      // 检测是否需要 chunking（基于文本长度和模式）
      const shouldUseChunking = 
        longTextMode === 'plan_review' || 
        (longTextMode !== 'off' && (message.length > 12000 || message.split('\n').length > 1000));
      
      if (shouldUseChunking) {
        console.log('📦 [Chunking] 启动超长文本智能分段处理...');
        
        // 创建 SSE 流
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const sseWriter = new SSEStreamWriter(writer);
        
        handoffToStream = true;
        
        // 异步处理
        (async () => {
          try {
            // 发送初始化事件
            await sseWriter.sendEvent({
              conversationId,
              type: 'init',
              mode: 'chunking',
            });
            
            // 启动心跳
            sseWriter.startHeartbeat(15000);
            
            // 执行 chunking 处理
            await handleChunkingPlanReview(
              message,
              userId,
              conversationId,
              clientAssistantMessageId,
              modelType,
              sseWriter,
              longTextOptions
            );
            
            await sseWriter.close();
          } catch (error: any) {
            console.error('❌ [Chunking] 处理失败:', error);
            
            if (!sseWriter.isClosed()) {
              await sseWriter.sendEvent({ 
                error: error.message || '超长文本处理失败' 
              });
            }
            
            await sseWriter.close();
          } finally {
            slot.release();
          }
        })();
        
        return new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      }
      
      // ==================== 多Agent模式 ====================
      if (mode === 'multi_agent') {
        console.log('🤖 [MultiAgent] 启动多Agent协作模式...');
        handoffToStream = true;
        return handleMultiAgentMode(
          message, 
          userId, 
          conversationId, 
          clientAssistantMessageId, 
          slot.release,
          data.resumeFromRound
        );
      }

      // ==================== 单Agent模式 ====================
      // 初始化记忆服务（使用滑动窗口）
      const memoryConfig = getRecommendedConfig(modelType);
      const memoryService = new ConversationMemoryService(memoryConfig);
      
      console.log(`🧠 记忆配置: 窗口=${memoryConfig.windowSize}轮, Token限制=${memoryConfig.maxTokens}`);

      // 构建消息历史（带上下文记忆）
      const messages = await memoryService.getConversationContext(
        conversationId,
        userId,
        message,
        SYSTEM_PROMPT
      );
      
      console.log(`📚 已加载对话上下文，包含 ${messages.length} 条消息`);

      // ✅ 创建 AbortController（用于用户断连时中断上游请求）
      // 注意：暂不实现，因为需要在更底层传递，留待后续优化
      // const abortController = new AbortController();
      
      // 调用模型
      if (modelType === 'local') {
        console.log('开始调用本地模型...');
        const stream = await callLocalModel(messages /* , abortController.signal */);
        handoffToStream = true;
        return handleLocalStream(
          stream,
          conversationId,
          userId,
          modelType,
          messages,
          clientAssistantMessageId,
          slot.release
        );
      } else if (modelType === 'volcano') {
        console.log('==========================================');
        console.log('🌋 开始调用火山引擎豆包模型...');
        console.log('🔑 ARK_API_KEY 配置状态:', volcengineService.isConfigured() ? '已配置' : '未配置');
        console.log('🎯 目标模型:', process.env.ARK_MODEL || 'doubao-1-5-thinking-pro-250415');
        console.log('==========================================');
        
        // 检查配置
        if (!volcengineService.isConfigured()) {
          console.error('❌ 火山引擎 API 未配置！');
          return errorResponse('火山引擎 API 未配置，请设置 ARK_API_KEY 环境变量');
        }

        const stream = await callVolcengineModel(messages /* , abortController.signal */);
        console.log('✅ 已收到火山引擎的流式响应');
        
        handoffToStream = true;
        return handleVolcanoStream(
          stream,
          conversationId,
          userId,
          modelType,
          messages,
          clientAssistantMessageId,
          slot.release
        );
      } else {
        return errorResponse('不支持的模型类型');
      }
    } finally {
      // ✅ 没有进入流式返回，就在这里释放名额（避免泄漏）
      if (!handoffToStream) {
        slot.release();
      }
    }
  } catch (error: any) {
    console.error('处理聊天请求失败:', error);
    return errorResponse(error.message || '服务器内部错误');
  }
}

