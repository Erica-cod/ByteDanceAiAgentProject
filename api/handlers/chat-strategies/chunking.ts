/**
 * 超长文本 Chunking 模式策略
 */

import { SSEStreamWriter } from '../../utils/sseStreamWriter.js';
import { createRemoteControlledWriter } from '../../_clean/infrastructure/streaming/controlled-sse-writer.js';
import { getContainer } from '../../_clean/di-container.js';
import { getCorsHeaders } from '../../lambda/_utils/cors.js';

export function shouldUseChunking(
  message: string,
  longTextMode?: string
): boolean {
  return (
    longTextMode === 'plan_review' ||
    (longTextMode !== 'off' &&
      (message.length > 12000 || message.split('\n').length > 1000))
  );
}

export async function handleChunkingMode(opts: {
  message: string;
  userId: string;
  conversationId: string;
  clientAssistantMessageId?: string;
  modelType: 'local' | 'volcano';
  longTextOptions?: any;
  release: () => void;
  requestOrigin?: string;
}): Promise<Response> {
  const {
    message, userId, conversationId,
    clientAssistantMessageId, modelType,
    longTextOptions, release, requestOrigin,
  } = opts;

  console.log('📦 [Chunking] 启动超长文本智能分段处理...');

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const sseWriter = new SSEStreamWriter(writer);
  const controlledWriter = createRemoteControlledWriter(sseWriter);

  (async () => {
    try {
      await controlledWriter.sendDirect({
        conversationId,
        type: 'init',
        mode: 'chunking',
      });

      sseWriter.startHeartbeat(15000);

      const container = getContainer();
      const processLongTextAnalysisUseCase = container.getProcessLongTextAnalysisUseCase();
      await processLongTextAnalysisUseCase.execute(
        message, userId, conversationId,
        clientAssistantMessageId, modelType,
        sseWriter, longTextOptions
      );

      await sseWriter.close();
    } catch (error: any) {
      console.error('❌ [Chunking] 处理失败:', error);
      if (!sseWriter.isClosed()) {
        await controlledWriter.sendDirect({
          error: error.message || '超长文本处理失败',
        });
      }
      await sseWriter.close();
    } finally {
      release();
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
