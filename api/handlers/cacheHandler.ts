/**
 * 缓存处理器
 *
 * 三级缓存策略：
 *   L1 (>=0.98): 直接返回缓存内容（打字机效果）
 *   L2 (>=0.88): 缓存命中但需要变体 → 用本地模型基于缓存改写
 *   L3 (<0.88):  未命中，返回 null 走正常模型调用
 */

import { SSEStreamWriter } from '../utils/sseStreamWriter.js';
import { getContainer } from '../_clean/di-container.js';
import { requestCacheService, type CachedResponse } from '../_clean/infrastructure/cache/request-cache.service.js';
import { callLocalModel } from '../_clean/infrastructure/llm/model-service.js';

/**
 * 发送缓存内容到前端（打字机效果）+ 保存到数据库
 */
async function streamCachedContent(
  cachedResponse: CachedResponse,
  conversationId: string,
  userId: string,
  modelType: 'local' | 'volcano',
  clientAssistantMessageId: string | undefined,
  release: () => void,
  extraInitFields?: Record<string, any>
): Promise<Response> {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const sseWriter = new SSEStreamWriter(writer);

  const {
    createLocalControlledWriter,
    createRemoteControlledWriter,
  } = await import('../_clean/infrastructure/streaming/controlled-sse-writer.js');

  const controlledWriter =
    modelType === 'local'
      ? createLocalControlledWriter(sseWriter)
      : createRemoteControlledWriter(sseWriter);

  (async () => {
    try {
      await controlledWriter.sendDirect({
        conversationId,
        type: 'init',
        mode: 'cached',
        cached: true,
        cacheHitCount: cachedResponse.hitCount,
        cacheHitLevel: cachedResponse.hitLevel,
        ...extraInitFields,
      });

      sseWriter.startHeartbeat(15000);

      const content = cachedResponse.content;
      const chunkSize = 10;

      for (let i = chunkSize; i <= content.length; i += chunkSize) {
        if (controlledWriter.isClosed()) {
          console.warn('⚠️  [Cache] 客户端已断开');
          break;
        }
        await controlledWriter.sendEvent(content.slice(0, i), {
          thinking: cachedResponse.thinking,
        });
      }

      if (!controlledWriter.isClosed()) {
        await controlledWriter.sendEvent(content, {
          thinking: cachedResponse.thinking,
        });
      }

      controlledWriter.logStats();

      try {
        const container = getContainer();
        const createMessageUseCase = container.getCreateMessageUseCase();
        const updateConversationUseCase = container.getUpdateConversationUseCase();

        await createMessageUseCase.execute(
          conversationId,
          userId,
          'assistant',
          cachedResponse.content,
          clientAssistantMessageId,
          modelType,
          cachedResponse.thinking
        );

        const conversation = await container.getGetConversationUseCase().execute(conversationId, userId);
        if (conversation) {
          await updateConversationUseCase.execute(conversationId, userId, {
            messageCount: conversation.messageCount + 1,
          });
        }
        console.log('✅ [Cache] 缓存的消息已保存到数据库');
      } catch (dbError) {
        console.error('❌ [Cache] 保存缓存消息失败:', dbError);
      }

      await sseWriter.close();
    } catch (error: any) {
      console.error('❌ [Cache] 发送缓存内容失败:', error);
      await sseWriter.close();
    } finally {
      release();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Cache-Hit': 'true',
      'X-Cache-Hit-Level': cachedResponse.hitLevel,
      'X-Cache-Hit-Count': String(cachedResponse.hitCount),
    },
  });
}

/**
 * L2 变体生成：用本地模型基于缓存参考答案改写，避免远程模型调用。
 * 如果本地模型不可用，返回 null（交给正常流程处理）。
 */
async function generateVariantFromCache(
  message: string,
  cachedContent: string
): Promise<string | null> {
  try {
    const paraphraseMessages = [
      {
        role: 'system' as const,
        content: '你是一个改写助手。用户之前问过类似的问题，以下是参考回答。请基于这个参考回答，用不同的措辞、结构或角度重新回答用户的新问题。保持信息的准确性，但让回答有所不同。不要提及"参考回答"的存在。',
      },
      {
        role: 'user' as const,
        content: `参考回答：\n${cachedContent}\n\n用户新问题：${message}\n\n请用不同的方式回答：`,
      },
    ];

    const stream = await callLocalModel(paraphraseMessages, {});

    let result = '';
    for await (const chunk of stream) {
      const text = chunk.toString();
      const lines = text.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.message?.content) {
            result += json.message.content;
          }
        } catch {
          // 忽略非 JSON 行
        }
      }
    }

    if (result.trim().length > 20) {
      console.log(`✅ [Cache L2] 变体生成成功 (${result.length} chars)`);
      return result.trim();
    }

    console.warn('⚠️  [Cache L2] 变体生成内容太短，放弃');
    return null;
  } catch (err) {
    console.warn('⚠️  [Cache L2] 本地模型变体生成失败:', err);
    return null;
  }
}

/**
 * 检查并返回缓存的响应（三级缓存策略）
 * @returns Response 或 null（如果没有缓存或不适合缓存返回）
 */
export async function handleCacheRequest(
  message: string,
  userId: string,
  conversationId: string,
  modelType: 'local' | 'volcano',
  mode: 'single' | 'multi_agent' | undefined,
  clientAssistantMessageId: string | undefined,
  release: () => void
): Promise<Response | null> {
  if (mode === 'multi_agent') return null;
  if (!requestCacheService.isAvailable()) return null;

  console.log('🔍 [Cache] 检查缓存（三级策略）...');

  try {
    const cachedResponse = await requestCacheService.findCachedResponse(message, userId, {
      modelType,
      mode: mode || 'single',
    });

    if (!cachedResponse) {
      console.log('📭 [Cache] L3 未命中');
      return null;
    }

    // ── L1: 精确命中，直接返回 ──
    if (cachedResponse.hitLevel === 'L1') {
      console.log('🎯 [Cache L1] 精确命中，直接返回缓存');
      return streamCachedContent(
        cachedResponse, conversationId, userId, modelType,
        clientAssistantMessageId, release
      );
    }

    // ── L2: 语义命中，生成变体 ──
    if (cachedResponse.hitLevel === 'L2') {
      console.log('🔄 [Cache L2] 语义命中，尝试本地模型变体生成...');

      const variant = await generateVariantFromCache(message, cachedResponse.content);

      if (variant) {
        const variantResponse: CachedResponse = {
          ...cachedResponse,
          content: variant,
          hitLevel: 'L2',
        };
        return streamCachedContent(
          variantResponse, conversationId, userId, modelType,
          clientAssistantMessageId, release, { cacheVariant: true }
        );
      }

      // 本地模型变体生成失败，降级到正常模型调用
      console.log('📭 [Cache L2] 变体生成失败，降级到正常流程');
      return null;
    }

    return null;
  } catch (error: any) {
    console.error('⚠️  [Cache] 缓存查找失败，继续正常处理:', error);
    return null;
  }
}

