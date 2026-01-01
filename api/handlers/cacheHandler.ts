/**
 * 缓存处理器
 * 处理请求缓存的查找和返回
 */

import { SSEStreamWriter } from '../utils/sseStreamWriter.js';
import { getContainer } from '../_clean/di-container.js';
import { requestCacheService } from '../_clean/infrastructure/cache/request-cache.service.js';

/**
 * 检查并返回缓存的响应
 * @returns Response 或 null（如果没有缓存）
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
  // 多Agent模式不使用缓存
  if (mode === 'multi_agent') {
    return null;
  }

  // 缓存服务不可用
  if (!requestCacheService.isAvailable()) {
    return null;
  }

  console.log('🔍 [Cache] 检查缓存...');

  try {
    const cachedResponse = await requestCacheService.findCachedResponse(message, userId, {
      modelType,
      mode: mode || 'single',
      similarityThreshold: 0.95,
    });

    if (!cachedResponse) {
      console.log('📭 [Cache] 没有找到缓存');
      return null;
    }

    console.log('🎯 [Cache] 缓存命中！使用打字机效果返回缓存的响应');

    // 创建 SSE 流
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const sseWriter = new SSEStreamWriter(writer);

    // 使用受控 SSE Writer
    const {
      createLocalControlledWriter,
      createRemoteControlledWriter,
    } = await import('../_clean/infrastructure/streaming/controlled-sse-writer.js');

    const controlledWriter =
      modelType === 'local'
        ? createLocalControlledWriter(sseWriter)
        : createRemoteControlledWriter(sseWriter);

    // 异步发送缓存内容
    (async () => {
      try {
        // 发送初始化事件
        await controlledWriter.sendDirect({
          conversationId,
          type: 'init',
          mode: 'cached',
          cached: true,
          cacheHitCount: cachedResponse.hitCount,
        });

        // 启动心跳
        sseWriter.startHeartbeat(15000);

        // 使用打字机效果逐步推送缓存内容
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

        // 发送完整内容
        if (!controlledWriter.isClosed()) {
          await controlledWriter.sendEvent(content, {
            thinking: cachedResponse.thinking,
          });
        }

        controlledWriter.logStats();

        // 保存助手消息到数据库
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
        'X-Cache-Hit-Count': String(cachedResponse.hitCount),
      },
    });
  } catch (error: any) {
    console.error('⚠️  [Cache] 缓存查找失败，继续正常处理:', error);
    return null; // 缓存失败不影响主流程
  }
}

