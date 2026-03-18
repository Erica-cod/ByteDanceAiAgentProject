/**
 * 单 Agent 模式策略
 *
 * 负责上下文加载、模型路由（local / volcano 智能分级）、流式响应分发
 */

import { getContainer } from '../../_clean/di-container.js';
import { getRecommendedConfig } from '../../config/memoryConfig.js';
import { SYSTEM_PROMPT } from '../../config/systemPrompt.js';
import { callLocalModel, callVolcengineModel, callRemoteLiteModel } from '../../_clean/infrastructure/llm/model-service.js';
import { classifyRequest } from '../../_clean/infrastructure/llm/request-classifier.js';
import { getRegistry } from '../../_clean/infrastructure/llm/providers/registry.js';
import { toolRegistry } from '../../tools/index.js';
import { handleVolcanoStream, handleLocalStream } from '../singleAgentHandler.js';
import { errorResponse } from '../../lambda/_utils/response.js';

export async function handleSingleAgent(opts: {
  message: string;
  userId: string;
  conversationId: string;
  modelType: 'local' | 'volcano';
  clientAssistantMessageId?: string;
  release: () => void;
  requestOrigin?: string;
}): Promise<Response> {
  const {
    message, userId, conversationId,
    modelType, clientAssistantMessageId,
    release, requestOrigin,
  } = opts;

  const memoryConfig = getRecommendedConfig(modelType);
  const container = getContainer();
  const getConversationContextUseCase = container.getGetConversationContextUseCase();

  console.log(`🧠 记忆配置: 窗口=${memoryConfig.windowSize}轮, Token限制=${memoryConfig.maxTokens}`);

  const contextResult = await getConversationContextUseCase.execute({
    conversationId,
    userId,
    currentMessage: message,
    systemPrompt: SYSTEM_PROMPT,
    config: memoryConfig,
  });

  const messages = contextResult.context;
  console.log(`📚 已加载对话上下文，包含 ${messages.length} 条消息`);
  console.log(`📊 记忆统计: ${contextResult.stats.uniqueMessages} 条唯一消息, 预估 ${contextResult.stats.estimatedTokens} tokens`);

  const tools =
    modelType === 'volcano'
      ? toolRegistry.getRelevantSchemas(message)
      : toolRegistry.getAllSchemas();
  console.log(`🔧 传递 ${tools.length} 个工具定义给模型 (${modelType === 'volcano' ? '已瘦身' : '全量'})`);

  // ==================== 本地模型 ====================
  if (modelType === 'local') {
    console.log('开始调用本地模型...');
    const stream = await callLocalModel(messages, { tools });
    return handleLocalStream(
      stream, conversationId, userId, modelType,
      messages, clientAssistantMessageId, release, message
    );
  }

  // ==================== 远程模型（火山引擎）====================
  const remoteProvider = getRegistry().get('remote');
  const remoteAvailable = remoteProvider ? await remoteProvider.isAvailable() : false;

  if (!remoteAvailable) {
    console.error('❌ 远程模型 API 未配置！');
    return errorResponse('远程模型 API 未配置，请设置 ARK_API_KEY 环境变量', requestOrigin);
  }

  const classification = classifyRequest(messages);
  console.log(`🌋 火山引擎智能路由 — 分类: ${classification.level} (置信度 ${classification.confidence.toFixed(2)}), Tier: ${classification.suggestedTier}`);

  // local-first cascade
  const enableLocalFirst = process.env.ENABLE_LOCAL_FIRST !== 'false';
  if (enableLocalFirst && classification.level === 'simple' && classification.confidence >= 0.8) {
    console.log('🏠 [LocalFirst] 简单请求，尝试本地模型处理');
    try {
      const localProvider = getRegistry().get('local');
      if (localProvider && (await localProvider.isAvailable())) {
        const stream = await callLocalModel(messages, { tools });
        console.log('✅ [LocalFirst] 使用本地模型处理简单请求');
        return handleLocalStream(
          stream, conversationId, userId, 'local',
          messages, clientAssistantMessageId, release, message
        );
      }
    } catch (localErr) {
      console.warn('⚠️  [LocalFirst] 本地模型不可用，fallback 到远程 lite:', localErr);
    }
  }

  // 根据分类选择远程模型
  let stream;
  if (classification.suggestedTier === 1) {
    console.log('🎯 使用 remote-lite 模型');
    stream = await callRemoteLiteModel(messages, { tools });
  } else {
    console.log('🎯 使用标准远程模型:', remoteProvider?.getModelName());
    stream = await callVolcengineModel(messages, { tools });
  }
  console.log('✅ 已收到远程模型的流式响应');

  return handleVolcanoStream(
    stream, conversationId, userId, modelType,
    messages, clientAssistantMessageId, release, message
  );
}
