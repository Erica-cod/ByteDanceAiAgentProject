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

// ✅ V2: 初始化工具系统
import { initializeToolSystem } from '../tools/v2/index.js';

// ✅ 模块化 LLM Provider 注册表（预热）
import { getRegistry } from '../_clean/infrastructure/llm/providers/registry.js';

// 初始化标志（确保只初始化一次）
let toolSystemInitialized = false;
if (!toolSystemInitialized) {
  initializeToolSystem();
  getRegistry(); // 预热：基于环境变量自动注册本地/远程 Provider
  toolSystemInitialized = true;
}
import { errorResponse, errorResponseWithStatus } from './_utils/response.js';
import { getCorsHeaders, handleOptionsRequest } from './_utils/cors.js';
import { acquireSSESlot } from '../_clean/infrastructure/streaming/sse-limiter.js';
import { getContainer } from '../_clean/di-container.js';
import { getRecommendedConfig } from '../config/memoryConfig.js';
import { SYSTEM_PROMPT } from '../config/systemPrompt.js';
import { callLocalModel, callVolcengineModel } from '../_clean/infrastructure/llm/model-service.js';
import { handleMultiAgentMode } from '../handlers/multiAgentHandler.js';
import { handleVolcanoStream, handleLocalStream } from '../handlers/singleAgentHandler.js';
import { handleResumeRequest } from '../handlers/resumeHandler.js';
import { handleCacheRequest } from '../handlers/cacheHandler.js';
import { SSEStreamWriter } from '../utils/sseStreamWriter.js';
import type { ChatRequestData, RequestOption } from '../types/chat.js';
import { gunzip } from 'zlib';
import { promisify } from 'util';
import { getBffSessionFromHeaders } from './_utils/bffOidcAuth.js';
import { requireCsrf } from './_utils/csrf.js';

const gunzipAsync = promisify(gunzip);

// 初始化数据库连接
connectToDatabase().catch(console.error);

/**
 * 统一返回 429（用于限流/并发限制）+ 队列信息
 */
function tooManyRequests(
  message: string,
  retryAfterSec: number,
  requestOrigin?: string,
  queueToken?: string,
  queuePosition?: number,
  estimatedWaitSec?: number
) {
  const corsHeaders = getCorsHeaders(requestOrigin);
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Retry-After': String(retryAfterSec),
    ...corsHeaders,
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
 * OPTIONS /api/chat - 处理预检请求
 */
export async function options({ headers }: RequestOption<any, any>) {
  const origin = headers?.origin;
  return handleOptionsRequest(origin);
}

/**
 * POST /api/chat - 发送聊天消息（流式响应）
 */
export async function post({
  data,
  headers,
}: RequestOption<any, ChatRequestData>) {
  try {
    const requestOrigin = headers?.origin;
    console.log('=== 收到聊天请求 ===');
    
    // ✅ 类型检查：确保 data 存在
    if (!data) {
      return errorResponse('请求数据不能为空', requestOrigin);
    }

    // ✅ CSRF + Origin/Referer 校验（保护所有写请求）
    const csrf = await requireCsrf(headers);
    if (csrf.ok === false) {
      return errorResponseWithStatus(csrf.message, csrf.status, requestOrigin);
    }
    
    let {
      message,
      modelType,
      conversationId: reqConversationId,
      userId,
      deviceId,
      mode,
      clientUserMessageId,
      clientAssistantMessageId,
      queueToken,
      uploadSessionId,
      isCompressed,
      resumeFrom, // 续流参数：{ messageId, position }
    } = data;

    // 如果已登录，后端统一以会话里的 sub 作为 userId，避免前端残留 userId 导致串数据
    const session = await getBffSessionFromHeaders(headers);
    if (session?.user?.sub) {
      if (userId && userId !== session.user.sub) {
        console.warn('⚠️ 检测到 userId 与登录会话不一致，已自动切换到会话用户');
      }
      userId = session.user.sub;
    }

    // ✅ Clean Architecture: 处理上传会话（压缩或分片上传）
    if (uploadSessionId) {
      console.log(`📦 [Upload] 检测到上传会话: ${uploadSessionId}`);
      
      try {
        const container = getContainer();
        
        // 组装分片
        const assembleChunksUseCase = container.getAssembleChunksUseCase();
        const assembled = await assembleChunksUseCase.execute(uploadSessionId);
        console.log(`📦 [Upload] 组装完成: ${assembled.length} bytes`);
        
        // 如果是压缩的，解压
        if (isCompressed) {
          console.log(`📦 [Upload] 正在解压...`);
          const decompressed = await gunzipAsync(assembled);
          message = decompressed.toString('utf-8');
          console.log(`📦 [Upload] 解压完成: ${message.length} 字符`);
        } else {
          message = assembled.toString('utf-8');
        }
        
        // 清理临时文件
        const cleanupSessionUseCase = container.getCleanupSessionUseCase();
        await cleanupSessionUseCase.execute(uploadSessionId);
        console.log(`📦 [Upload] 已清理临时文件`);
        
      } catch (error: any) {
        console.error(`❌ [Upload] 处理上传会话失败:`, error);
        return errorResponse(`上传处理失败: ${error.message}`, requestOrigin);
      }
    }

    console.log('解析后的 message长度:', message?.length || 0);
    console.log('解析后的 modelType:', modelType);
    console.log('解析后的 conversationId:', reqConversationId);
    console.log('解析后的 userId:', userId);
    console.log('解析后的 deviceId:', deviceId || '未提供（降级到 userId)');
    console.log('解析后的 mode:', mode || 'single');

    // ==================== 参数验证 ====================
    if (!message || !message.trim()) {
      console.log('消息内容为空');
      return errorResponse('消息内容不能为空', requestOrigin);
    }

    if (!userId) {
      return errorResponse('userId is required', requestOrigin);
    }

    // ==================== 并发限制（SSE长连接占位）====================
    const identityId = deviceId || userId;
    const slot = acquireSSESlot(identityId, queueToken);
    
    if (slot.ok === false) {
      console.warn('⚠️  SSE 并发限制触发，已加入队列:', slot);
      return tooManyRequests(
        slot.reason,
        slot.retryAfterSec,
        requestOrigin,
        slot.queueToken,
        slot.queuePosition,
        slot.estimatedWaitSec
      );
    }

    // 获取 release 函数
    const release = slot.release;

    // 是否已把 release"交接"给流式处理
    let handoffToStream = false;

    try {
      // ✅ Clean Architecture: 确保用户存在
      const container = getContainer();
      const getOrCreateUserUseCase = container.getGetOrCreateUserUseCase();
      await getOrCreateUserUseCase.execute(userId);

      // ✅ Clean Architecture: 如果没有 conversationId，创建新对话
      let conversationId = reqConversationId;
      if (!conversationId) {
        const createConversationUseCase = container.getCreateConversationUseCase();
        const conversationEntity = await createConversationUseCase.execute(
          userId,
          message.slice(0, 50) + (message.length > 50 ? '...' : '')
        );
        conversationId = conversationEntity.conversationId;
        console.log('✅ Created new conversation:', conversationId);
      }

      // ==================== 续流请求处理 ====================
      const resumeResponse = await handleResumeRequest(resumeFrom, release);
      if (resumeResponse) {
        handoffToStream = true;
        return resumeResponse;
      }

      // ✅ Clean Architecture: 保存用户消息到数据库
      try {
        const createMessageUseCase = container.getCreateMessageUseCase();
        const updateConversationUseCase = container.getUpdateConversationUseCase();
        
        await createMessageUseCase.execute(
          conversationId,
          userId,
          'user',
          message,
          clientUserMessageId,
          modelType,
          undefined
        );
        
        const conversation = await container.getGetConversationUseCase().execute(conversationId, userId);
        if (conversation) {
          await updateConversationUseCase.execute(
            conversationId,
            userId,
            { messageCount: conversation.messageCount + 1 }
          );
        }
        
        console.log('✅ User message saved to database');
      } catch (dbError) {
        console.error('❌ Failed to save user message:', dbError);
        // 继续处理，不阻止 AI 回复
      }

      // ==================== 缓存检查 ====================
      const cacheResponse = await handleCacheRequest(
        message,
        userId,
        conversationId,
        modelType,
        mode,
        clientAssistantMessageId,
        release
      );
      if (cacheResponse) {
        handoffToStream = true;
        return cacheResponse;
      }

      // ==================== 超长文本 Chunking 模式 ====================
      const { longTextMode, longTextOptions } = data!; // data 已在上面检查过
      
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
        
        // ✅ 使用受控 SSE Writer（chunking模式使用远程配置）
        const { createRemoteControlledWriter } = await import('../_clean/infrastructure/streaming/controlled-sse-writer.js');
        const controlledWriter = createRemoteControlledWriter(sseWriter);
        
        handoffToStream = true;
        
        // 异步处理
        (async () => {
          try {
            // 发送初始化事件（直接发送）
            await controlledWriter.sendDirect({
              conversationId,
              type: 'init',
              mode: 'chunking',
            });
            
            // 启动心跳
            sseWriter.startHeartbeat(15000);
            
            // ✅ Clean Architecture: 执行长文本分析
            const processLongTextAnalysisUseCase = container.getProcessLongTextAnalysisUseCase();
            await processLongTextAnalysisUseCase.execute(
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
              await controlledWriter.sendDirect({ 
                error: error.message || '超长文本处理失败' 
              });
            }
            
            await sseWriter.close();
          } finally {
            slot.release();
          }
        })();
        
        const corsHeaders = getCorsHeaders(requestOrigin);
        return new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            ...corsHeaders,
          },
        });
      }
      
      // ==================== 多Agent模式 ====================
      if (mode === 'multi_agent') {
        // ✅ 登录控制：未登录禁止使用多 Agent
        // 🧪 测试环境例外：允许通过 X-Test-Auth=1 绕过（仅用于 Jest E2E，不影响生产/开发）
        const testBypass =
          process.env.NODE_ENV === 'test'
          && (headers?.['x-test-auth'] === '1' || headers?.['X-Test-Auth'] === '1');

        if (!testBypass) {
          const session = await getBffSessionFromHeaders(headers);
          if (!session) {
            return errorResponseWithStatus('请先登录后再使用多 Agent 模式（演示版限制）', 403, requestOrigin);
          }
        }

        console.log('🤖 [MultiAgent] 启动多Agent协作模式...');
        handoffToStream = true;
        return handleMultiAgentMode(
          message, 
          userId, 
          conversationId, 
          clientAssistantMessageId, 
          slot.release,
          data!.resumeFromRound // data 已在上面检查过
        );
      }

      // ==================== 单Agent模式 ====================
      // ✅ V2: 检查是否启用 Function Calling
      const useV2 = process.env.TOOL_SYSTEM_V2 === 'true';
      console.log(`🔧 工具系统版本: ${useV2 ? 'V2 (Function Calling)' : 'V1 (Prompt-based)'}`);

      // 🆕 使用新的 Clean Architecture - Memory 模块
      const memoryConfig = getRecommendedConfig(modelType);
      const getConversationContextUseCase = container.getGetConversationContextUseCase();
      
      console.log(`🧠 记忆配置: 窗口=${memoryConfig.windowSize}轮, Token限制=${memoryConfig.maxTokens}`);

      // ✅ V2: 根据版本选择 System Prompt
      let systemPrompt: string;
      if (useV2) {
        const { SYSTEM_PROMPT_V2 } = await import('../config/systemPrompt.v2.js');
        systemPrompt = SYSTEM_PROMPT_V2;
      } else {
        systemPrompt = SYSTEM_PROMPT;
      }

      // 构建消息历史（带上下文记忆）
      const contextResult = await getConversationContextUseCase.execute({
        conversationId,
        userId,
        currentMessage: message,
        systemPrompt: systemPrompt,
        config: memoryConfig,
      });
      
      const messages = contextResult.context;
      console.log(`📚 已加载对话上下文，包含 ${messages.length} 条消息`);
      console.log(`📊 记忆统计: ${contextResult.stats.uniqueMessages} 条唯一消息, 预估 ${contextResult.stats.estimatedTokens} tokens`);

      // ✅ 创建 AbortController（用于用户断连时中断上游请求）
      // 注意：暂不实现，因为需要在更底层传递，留待后续优化
      // const abortController = new AbortController();
      
      // 调用模型
      if (useV2) {
        // ==================== V2: Function Calling 模式 ====================
        console.log('🔍 [V2] 开始动态导入 V2 模块...');
        const { callLocalModelV2, callVolcengineModelV2 } = await import('../_clean/infrastructure/llm/model-service.v2.js');
        const { handleLocalStreamV2, handleVolcanoStreamV2 } = await import('../handlers/singleAgentHandler.v2.js');
        const { toolRegistry } = await import('../tools/v2/index.js');
        console.log('✅ [V2] 动态导入成功');
        console.log('✅ [V2] handleVolcanoStreamV2 类型:', typeof handleVolcanoStreamV2);

        // 获取工具定义
        const tools = toolRegistry.getAllSchemas();
        console.log(`🔧 传递 ${tools.length} 个工具定义给模型`);

        if (modelType === 'local') {
          console.log('开始调用本地模型（V2 - Function Calling）...');
          const stream = await callLocalModelV2(messages, { tools });
          handoffToStream = true;
          return handleLocalStreamV2(
            stream,
            conversationId,
            userId,
            modelType,
            messages,
            clientAssistantMessageId,
            slot.release,
            message
          );
        } else if (modelType === 'volcano') {
          const remoteProvider = getRegistry().get('remote');
          const remoteAvailable = remoteProvider ? await remoteProvider.isAvailable() : false;
          console.log('==========================================');
          console.log('🌋 开始调用火山引擎豆包模型（V2 - Function Calling）...');
          console.log('🔑 远程 Provider 状态:', remoteAvailable ? '已配置' : '未配置');
          console.log('🎯 目标模型:', remoteProvider?.getModelName() || 'N/A');
          console.log('==========================================');
          
          if (!remoteAvailable) {
            console.error('❌ 远程模型 API 未配置！');
            return errorResponse('远程模型 API 未配置，请设置 ARK_API_KEY 环境变量', requestOrigin);
          }

          const stream = await callVolcengineModelV2(messages, { tools });
          console.log('✅ 已收到远程模型的流式响应');
          
          handoffToStream = true;
          const result = handleVolcanoStreamV2(
            stream,
            conversationId,
            userId,
            modelType,
            messages,
            clientAssistantMessageId,
            slot.release,
            message
          );
          console.log('🔍 [V2] handleVolcanoStreamV2 已返回，result 类型:', typeof result, result?.constructor?.name);
          return result;
        } else {
          return errorResponse('不支持的模型类型', requestOrigin);
        }
      } else {
        // ==================== V1: Prompt-based 模式 ====================
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
            slot.release,
            message // 传递原始请求文本用于缓存
          );
        } else if (modelType === 'volcano') {
          const remoteProviderV1 = getRegistry().get('remote');
          const remoteAvailableV1 = remoteProviderV1 ? await remoteProviderV1.isAvailable() : false;
          console.log('==========================================');
          console.log('🌋 开始调用火山引擎豆包模型...');
          console.log('🔑 远程 Provider 状态:', remoteAvailableV1 ? '已配置' : '未配置');
          console.log('🎯 目标模型:', remoteProviderV1?.getModelName() || 'N/A');
          console.log('==========================================');
          
          if (!remoteAvailableV1) {
            console.error('❌ 远程模型 API 未配置！');
            return errorResponse('远程模型 API 未配置，请设置 ARK_API_KEY 环境变量', requestOrigin);
          }

          const stream = await callVolcengineModel(messages /* , abortController.signal */);
          console.log('✅ 已收到远程模型的流式响应');
          
          handoffToStream = true;
          return handleVolcanoStream(
            stream,
            conversationId,
            userId,
            modelType,
            messages,
            clientAssistantMessageId,
            slot.release,
            message // 传递原始请求文本用于缓存
          );
        } else {
          return errorResponse('不支持的模型类型', requestOrigin);
        }
      }
    } finally {
      // ✅ 没有进入流式返回，就在这里释放名额（避免泄漏）
      if (!handoffToStream) {
        slot.release();
      }
    }
  } catch (error: any) {
    console.error('处理聊天请求失败:', error);
    // 注意：这里的 requestOrigin 可能未定义（如果异常发生在早期）
    const origin = (error as any).requestOrigin;
    return errorResponse(error.message || '服务器内部错误', origin);
  }
}

