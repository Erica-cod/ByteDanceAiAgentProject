/**
 * 续流处理器
 * 处理前端断线重连后的续传请求
 */

import { SSEStreamWriter } from '../utils/sseStreamWriter.js';
import { getContainer } from '../_clean/di-container.js';

/**
 * 处理续流请求
 * @returns Response 或 null（如果不是续流请求）
 */
export async function handleResumeRequest(
  resumeFrom: { messageId: string; position: number } | undefined,
  release: () => void
): Promise<Response | null> {
  // 不是续流请求
  if (!resumeFrom || !resumeFrom.messageId) {
    return null;
  }

  console.log(`🔄 [Resume] 续流请求: messageId=${resumeFrom.messageId}, position=${resumeFrom.position || 0}`);

  try {
    const container = getContainer();
    const streamProgressRepo = container.getStreamProgressRepository();
    const progress = await streamProgressRepo.findByMessageId(resumeFrom.messageId);

    if (!progress) {
      console.log('⚠️  [Resume] 未找到进度记录');
      release();
      return new Response(
        JSON.stringify({ success: false, error: '未找到进度记录，可能已过期（30分钟TTL）' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!progress.accumulatedText) {
      console.log('⚠️  [Resume] 进度记录中没有内容');
      release();
      return new Response(
        JSON.stringify({ success: false, error: '进度记录中没有内容' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const startPosition = resumeFrom.position || 0;
    const remainingText = progress.accumulatedText.slice(startPosition);

    if (remainingText.length === 0) {
      console.log('⚠️  [Resume] 没有剩余内容需要发送');
      release();
      return new Response(
        JSON.stringify({ success: false, error: '没有剩余内容需要发送' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`✅ [Resume] 找到进度，续传 ${remainingText.length} 字符（从位置 ${startPosition} 开始）`);

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
      progress.modelType === 'local'
        ? createLocalControlledWriter(sseWriter)
        : createRemoteControlledWriter(sseWriter);

    // 异步发送剩余内容
    (async () => {
      try {
        // 发送初始化事件
        await controlledWriter.sendDirect({
          conversationId: progress.conversationId,
          type: 'init',
          mode: 'resume',
          resumed: true,
          startPosition,
        });

        // 模拟打字机效果发送剩余内容
        const chunkSize = 10;
        for (let i = chunkSize; i <= remainingText.length; i += chunkSize) {
          if (controlledWriter.isClosed()) break;

          await controlledWriter.sendEvent(remainingText.slice(0, i), {
            thinking: progress.thinking,
            sources: progress.sources,
          });
        }

        // 发送完整内容
        if (!controlledWriter.isClosed()) {
          await controlledWriter.sendEvent(remainingText, {
            thinking: progress.thinking,
            sources: progress.sources,
          });
        }

        controlledWriter.logStats();
        await sseWriter.close();
      } catch (error) {
        console.error('❌ [Resume] 续传失败:', error);
        if (!sseWriter.isClosed()) {
          await sseWriter.sendEvent({ error: '续传失败' });
          await sseWriter.close();
        }
      } finally {
        release();
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Conversation-Id': progress.conversationId,
      },
    });
  } catch (error) {
    console.error('❌ [Resume] 续流失败:', error);
    release();
    return new Response(
      JSON.stringify({ success: false, error: '续流失败' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

