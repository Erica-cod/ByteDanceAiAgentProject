/**
 * 火山引擎模型 SSE 处理器
 * 处理火山引擎模型的流式响应并转换为 SSE 格式
 */

import { volcengineService } from '../services/volcengineService.js';
import { MessageService } from '../services/messageService.js';
import { ConversationService } from '../services/conversationService.js';
import { extractThinkingAndContent } from '../utils/contentExtractor.js';
import { processMultiToolWorkflow } from './workflowProcessor.js';
import {
  createSafeSSEWriter,
  createHeartbeat,
  sendInitData,
  sendDoneSignal,
} from './sseStreamWriter.js';
import type { ChatMessage } from '../types/chat.js';

/**
 * 处理火山引擎流式响应并转换为 SSE 格式
 */
export async function streamVolcengineToSSEResponse(
  stream: any,
  conversationId: string,
  userId: string,
  modelType: 'local' | 'volcano',
  messages: ChatMessage[],
  clientAssistantMessageId?: string,
  onFinally?: () => void
): Promise<Response> {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // 创建安全的写入器
  const { safeWrite, checkClosed, markClosed } = createSafeSSEWriter(writer, encoder);

  let buffer = '';
  let accumulatedText = '';
  let lastSentContent = '';
  let lastSentThinking = '';

  // 存储搜索来源链接
  let searchSources: Array<{ title: string; url: string }> | undefined;

  // 标记消息是否已保存到数据库（避免重复保存）
  let messageSaved = false;

  // 异步处理流
  (async () => {
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    try {
      // 发送初始化数据
      await sendInitData(safeWrite, conversationId);

      // 启动心跳
      heartbeatTimer = createHeartbeat(safeWrite);

      for await (const chunk of stream) {
        const chunkStr = chunk.toString();
        buffer += chunkStr;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            // 使用火山引擎服务的解析器
            const content = volcengineService.parseStreamLine(line);

            if (content) {
              accumulatedText += content;
              const { thinking, content: mainContent } =
                extractThinkingAndContent(accumulatedText);

              // 立即发送每次更新，确保流式效果
              const sseData = JSON.stringify({
                content: mainContent,
                thinking: thinking || undefined,
              });

              console.log(
                '📤 发送到前端:',
                mainContent.substring(0, 50) + (mainContent.length > 50 ? '...' : '')
              );
              if (!(await safeWrite(`data: ${sseData}\n\n`))) return;
              lastSentContent = mainContent;
              lastSentThinking = thinking;
            }

            // 检查是否完成
            if (line.includes('[DONE]')) {
              console.log('✅ 火山引擎流式响应完成');
              console.log('📝 完整响应内容:', accumulatedText);

              // ==================== 多工具调用工作流 ====================
              const workflowResult = await processMultiToolWorkflow(
                accumulatedText,
                messages,
                userId,
                safeWrite
              );

              // 保存搜索来源
              if (workflowResult.searchSources) {
                searchSources = workflowResult.searchSources;
              }

              // 最终处理和保存
              if (workflowResult.finalContent || accumulatedText) {
                const finalContent = workflowResult.finalContent || accumulatedText;
                const finalThinking = workflowResult.finalThinking;

                const sseData = JSON.stringify({
                  content: finalContent,
                  thinking: finalThinking || undefined,
                  sources: searchSources || undefined,
                });
                if (!(await safeWrite(`data: ${sseData}\n\n`))) return;

                // 保存 AI 回复到数据库
                try {
                  console.log('💾 准备保存消息到数据库，searchSources:', searchSources);
                  await MessageService.addMessage(
                    conversationId,
                    userId,
                    'assistant',
                    finalContent,
                    clientAssistantMessageId,
                    finalThinking || undefined,
                    modelType,
                    searchSources || undefined
                  );
                  await ConversationService.incrementMessageCount(conversationId, userId);
                  messageSaved = true; // ✅ 标记已保存
                  console.log(
                    '✅ AI完整回答已保存到数据库 with sources:',
                    searchSources?.length || 0
                  );
                } catch (dbError) {
                  console.error('❌ Failed to save AI message:', dbError);
                }
              }

              await sendDoneSignal(safeWrite, writer, checkClosed());
              return;
            }
          }
        }
      }

      // 处理缓冲区剩余数据
      if (buffer.trim()) {
        const content = volcengineService.parseStreamLine(buffer);
        if (content) {
          accumulatedText += content;
          const { thinking, content: mainContent } = extractThinkingAndContent(accumulatedText);

          const sseData = JSON.stringify({
            content: mainContent || accumulatedText,
            thinking: thinking || undefined,
          });
          if (!(await safeWrite(`data: ${sseData}\n\n`))) return;
        }
      }

      await sendDoneSignal(safeWrite, writer, checkClosed());
    } catch (error: any) {
      // 如果是客户端断开连接，不打印错误日志（这是正常情况）
      if (
        error.name === 'AbortError' ||
        error.code === 'ABORT_ERR' ||
        error.code === 'ERR_STREAM_PREMATURE_CLOSE'
      ) {
        console.log('⚠️  [SSE] 客户端主动断开连接');
        markClosed();
      } else {
        console.error('❌ [SSE] 流处理错误:', error);
        // 只有在流没关闭时才尝试发送错误
        if (!checkClosed()) {
          try {
            const errorData = JSON.stringify({ error: error.message });
            await safeWrite(`data: ${errorData}\n\n`);
          } catch (writeError) {
            // 忽略写入错误
          }
        }
      }

      // 尝试关闭 writer
      try {
        await writer.close();
      } catch (closeError) {
        // 忽略关闭错误
      }
    } finally {
      // ✅ 保存不完整的回答（参考 ChatGPT 设计：即使中断，已生成的内容也要保存）
      if (!messageSaved && accumulatedText && accumulatedText.trim()) {
        try {
          console.log('💾 [Finally] 保存不完整的回答到数据库，长度:', accumulatedText.length);
          const { thinking, content } = extractThinkingAndContent(accumulatedText);

          await MessageService.addMessage(
            conversationId,
            userId,
            'assistant',
            content || accumulatedText,
            clientAssistantMessageId,
            thinking || undefined,
            modelType,
            searchSources || undefined
          );
          await ConversationService.incrementMessageCount(conversationId, userId);
          console.log('✅ [Finally] 不完整的回答已保存到数据库');
        } catch (dbError) {
          console.error('❌ [Finally] 保存不完整回答失败:', dbError);
        }
      }

      // ✅ 确保清理心跳定时器，避免资源泄漏
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      // ✅ 确保释放并发名额
      try {
        onFinally?.();
      } catch (e) {
        // 忽略释放时的异常，避免影响主流程
      }
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

