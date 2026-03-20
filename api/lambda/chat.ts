/**
 * Chat API - 符合 Modern.js BFF 规范
 * 路由: /api/chat
 *
 * 职责：参数校验 → 身份解析 → 并发控制 → 策略分发
 * 具体业务逻辑拆分到 handlers/chat-strategies/
 */

import '../config/env.js';
import { connectToDatabase } from '../db/connection.js';
import { initializeToolSystem } from '../tools/index.js';
import { getRegistry } from '../_clean/infrastructure/llm/providers/registry.js';

let toolSystemInitialized = false;
if (!toolSystemInitialized) {
  initializeToolSystem();
  getRegistry();
  toolSystemInitialized = true;
}

import { errorResponse, errorResponseWithStatus } from './_utils/response.js';
import { getCorsHeaders, handleOptionsRequest } from './_utils/cors.js';
import { acquireSSESlot } from '../_clean/infrastructure/streaming/sse-limiter.js';
import { getContainer } from '../_clean/di-container.js';
import { handleResumeRequest } from '../handlers/resumeHandler.js';
import { handleCacheRequest } from '../handlers/cacheHandler.js';
import { resolveUploadMessage } from '../handlers/chat-strategies/upload.js';
import { shouldUseChunking, handleChunkingMode } from '../handlers/chat-strategies/chunking.js';
import { handleMultiAgent } from '../handlers/chat-strategies/multi-agent.js';
import { handleSingleAgent } from '../handlers/chat-strategies/single-agent.js';
import type { ChatRequestData, RequestOption } from '../types/chat.js';
import { getBffSessionFromHeaders } from './_utils/bffOidcAuth.js';
import { requireCsrf } from './_utils/csrf.js';

connectToDatabase().catch(console.error);

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

export async function options({ headers }: RequestOption<any, any>) {
  return handleOptionsRequest(headers?.origin);
}

export async function post({
  data,
  headers,
}: RequestOption<any, ChatRequestData>) {
  try {
    const requestOrigin = headers?.origin;
    console.log('=== 收到聊天请求 ===');

    if (!data) {
      return errorResponse('请求数据不能为空', requestOrigin);
    }

    const csrf = await requireCsrf(headers);
    if (csrf.ok === false) {
      return errorResponseWithStatus(csrf.message, csrf.status, requestOrigin);
    }

    let {
      message, modelType,
      conversationId: reqConversationId,
      userId, deviceId, mode,
      clientUserMessageId, clientAssistantMessageId,
      queueToken, uploadSessionId, isCompressed,
      resumeFrom,
    } = data;

    // ==================== 身份解析 ====================
    const session = await getBffSessionFromHeaders(headers);
    if (session?.user?.sub) {
      if (userId && userId !== session.user.sub) {
        console.warn('⚠️ 检测到 userId 与登录会话不一致，已自动切换到会话用户');
      }
      userId = session.user.sub;
    }

    // ==================== 上传会话解析 ====================
    if (uploadSessionId) {
      try {
        message = await resolveUploadMessage(uploadSessionId, isCompressed, message);
      } catch (error: any) {
        console.error(`❌ [Upload] 处理上传会话失败:`, error);
        return errorResponse(`上传处理失败: ${error.message}`, requestOrigin);
      }
    }

    // ==================== 参数校验 ====================
    if (!message || !message.trim()) {
      return errorResponse('消息内容不能为空', requestOrigin);
    }
    if (!userId) {
      return errorResponse('userId is required', requestOrigin);
    }

    // ==================== 并发限制 ====================
    const identityId = deviceId || userId;
    const slot = acquireSSESlot(identityId, queueToken);
    if (slot.ok === false) {
      console.warn('⚠️  SSE 并发限制触发，已加入队列:', slot);
      return tooManyRequests(
        slot.reason, slot.retryAfterSec, requestOrigin,
        slot.queueToken, slot.queuePosition, slot.estimatedWaitSec
      );
    }

    const release = slot.release;
    let handoffToStream = false;

    try {
      // ==================== 确保用户 & 对话存在 ====================
      const container = getContainer();
      await container.getGetOrCreateUserUseCase().execute(userId);

      let conversationId = reqConversationId;
      if (!conversationId) {
        const entity = await container.getCreateConversationUseCase().execute(
          userId,
          message.slice(0, 50) + (message.length > 50 ? '...' : '')
        );
        conversationId = entity.conversationId;
        console.log('✅ Created new conversation:', conversationId);
      }

      // ==================== 前置短路：续流 ====================
      const resumeResponse = await handleResumeRequest(resumeFrom, release);
      if (resumeResponse) { handoffToStream = true; return resumeResponse; }

      // ==================== 保存用户消息 ====================
      try {
        await container.getCreateMessageUseCase().execute(
          conversationId, userId, 'user', message,
          clientUserMessageId, modelType, undefined
        );
        const conversation = await container.getGetConversationUseCase().execute(conversationId, userId);
        if (conversation) {
          await container.getUpdateConversationUseCase().execute(
            conversationId, userId,
            { messageCount: conversation.messageCount + 1 }
          );
        }
        console.log('✅ User message saved to database');
      } catch (dbError) {
        console.error('❌ Failed to save user message:', dbError);
      }

      // ==================== 前置短路：缓存 ====================
      const cacheResponse = await handleCacheRequest(
        message, userId, conversationId, modelType,
        mode, clientAssistantMessageId, release
      );
      if (cacheResponse) { handoffToStream = true; return cacheResponse; }

      // ==================== 策略分发 ====================
      // 多 Agent 优先：用户显式选择的协作模式不应被自动节约策略覆盖
      if (mode === 'multi_agent') {
        handoffToStream = true;
        return handleMultiAgent({
          message, userId, conversationId,
          clientAssistantMessageId, release,
          resumeFromRound: data!.resumeFromRound,
          headers, requestOrigin,
        });
      }

      const { longTextMode, longTextOptions } = data!;

      if (shouldUseChunking(message, longTextMode)) {
        handoffToStream = true;
        return handleChunkingMode({
          message, userId, conversationId,
          clientAssistantMessageId, modelType,
          longTextOptions, release, requestOrigin,
        });
      }

      // 单 Agent（默认）
      if (modelType !== 'local' && modelType !== 'volcano') {
        return errorResponse('不支持的模型类型', requestOrigin);
      }

      handoffToStream = true;
      return handleSingleAgent({
        message, userId, conversationId,
        modelType, clientAssistantMessageId,
        release, requestOrigin,
      });

    } finally {
      if (!handoffToStream) {
        slot.release();
      }
    }
  } catch (error: any) {
    console.error('[Chat] 处理聊天请求失败:', error);
    return errorResponse('服务器内部错误，请稍后重试');
  }
}
