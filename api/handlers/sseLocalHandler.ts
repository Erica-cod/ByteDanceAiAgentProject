/**
 * 本地模型 SSE 处理器
 * 处理本地 Ollama 模型的流式响应并转换为 SSE 格式
 */

import { extractToolCallWithRemainder } from '../_clean/shared/utils/json-extractor.js';
import { extractThinkingAndContent } from '../_clean/shared/utils/content-extractor.js';
import { getContainer } from '../_clean/di-container.js';
import { executeToolCall } from '../_clean/infrastructure/tools/tool-executor.js';
import { callLocalModel } from '../_clean/infrastructure/llm/llm-caller.js';
import {
  createSafeSSEWriter,
  createHeartbeat,
  sendInitData,
  sendDoneSignal,
} from './sseStreamWriter.js';
import type { ChatMessage } from '../types/chat.js';

/**
 * 为本地模型处理流式响应并转换为 SSE 格式
 */
export async function streamToSSEResponse(
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
            try {
              const jsonData = JSON.parse(line);

              if (jsonData.message && jsonData.message.content !== undefined) {
                accumulatedText += jsonData.message.content;
                const { thinking, content } = extractThinkingAndContent(accumulatedText);

                if (content !== lastSentContent || thinking !== lastSentThinking) {
                  const sseData = JSON.stringify({
                    content: content,
                    thinking: thinking || undefined,
                  });

                  if (!(await safeWrite(`data: ${sseData}\n\n`))) return;
                  lastSentContent = content;
                  lastSentThinking = thinking;
                }
              }

              if (jsonData.done) {
                console.log('✅ 本地模型流式响应完成');
                console.log('📝 完整响应内容:', accumulatedText);

                // 检测是否有工具调用
                const toolCallResult = extractToolCallWithRemainder(accumulatedText);

                if (toolCallResult) {
                  console.log('🔧 [本地模型] 检测到工具调用:', toolCallResult.data);

                  // 发送工具调用通知
                  const toolCallNotice = JSON.stringify({
                    content: '正在搜索...',
                    toolCall: toolCallResult.data,
                  });
                  if (!(await safeWrite(`data: ${toolCallNotice}\n\n`))) return;

                  // 执行工具调用
                  const { resultText: toolResult, sources } = await executeToolCall(
                    toolCallResult.data,
                    userId
                  );
                  console.log('📦 工具执行结果（前200字符）:', toolResult.substring(0, 200) + '...');
                  console.log('🔗 来源链接:', sources?.length || 0, '条');

                  // 保存 sources，稍后随最终答案一起发送
                  searchSources = sources;

                  // 将工具结果添加到消息历史
                  messages.push(
                    { role: 'assistant', content: accumulatedText },
                    {
                      role: 'user',
                      content: `以下是搜索结果，请基于这些搜索结果回答用户的问题：\n\n${toolResult}\n\n请现在根据上述搜索结果，详细回答用户的问题。`,
                    }
                  );

                  // 重新调用模型，继续生成
                  console.log('🔄 基于搜索结果继续生成回答...');
                  const newStream = await callLocalModel(messages);

                  // 重置累积文本
                  accumulatedText = '';
                  lastSentContent = '';
                  lastSentThinking = '';
                  buffer = '';

                  // 继续处理新的流
                  for await (const chunk of newStream) {
                    const chunkStr = chunk.toString();
                    buffer += chunkStr;

                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                      if (line.trim()) {
                        try {
                          const jsonData = JSON.parse(line);

                          if (jsonData.message && jsonData.message.content !== undefined) {
                            accumulatedText += jsonData.message.content;
                            const { thinking, content } =
                              extractThinkingAndContent(accumulatedText);

                            if (content !== lastSentContent || thinking !== lastSentThinking) {
                              const sseData = JSON.stringify({
                                content: content,
                                thinking: thinking || undefined,
                              });

                              if (!(await safeWrite(`data: ${sseData}\n\n`))) return;
                              lastSentContent = content;
                              lastSentThinking = thinking;
                            }
                          }

                          if (jsonData.done) {
                            break;
                          }
                        } catch (error) {
                          console.error('解析流数据失败:', error);
                        }
                      }
                    }
                  }
                }

                // 最终处理和保存
                if (accumulatedText) {
                  const { thinking, content } = extractThinkingAndContent(accumulatedText);
                  const sseData = JSON.stringify({
                    content: content || accumulatedText,
                    thinking: thinking || undefined,
                    sources: searchSources || undefined,
                  });
                  if (!(await safeWrite(`data: ${sseData}\n\n`))) return;

                  // 保存 AI 回复到数据库
                  try {
                    console.log('💾 准备保存消息到数据库，searchSources:', searchSources);
                    const container = getContainer();
                    const createMessageUseCase = container.getCreateMessageUseCase();
                    const updateConversationUseCase = container.getUpdateConversationUseCase();
                    
                    await createMessageUseCase.execute(
                      conversationId,
                      userId,
                      'assistant',
                      content || accumulatedText,
                      clientAssistantMessageId,
                      modelType,
                      thinking || undefined,
                      searchSources || undefined
                    );
                    
                    // 增加消息计数
                    const conversation = await container.getGetConversationUseCase().execute(conversationId, userId);
                    if (conversation) {
                      await updateConversationUseCase.execute(
                        conversationId,
                        userId,
                        { messageCount: conversation.messageCount + 1 }
                      );
                    }
                    messageSaved = true;
                    console.log(
                      '✅ AI message saved to database with sources:',
                      searchSources?.length || 0
                    );
                  } catch (dbError) {
                    console.error('❌ Failed to save AI message:', dbError);
                  }
                }

                await sendDoneSignal(safeWrite, writer, checkClosed());
                return;
              }
            } catch (error) {
              console.error('解析流数据失败:', error);
            }
          }
        }
      }

      // 处理缓冲区剩余数据
      if (buffer.trim()) {
        try {
          const jsonData = JSON.parse(buffer);
          if (jsonData.message?.content) {
            accumulatedText += jsonData.message.content;
            const { thinking, content } = extractThinkingAndContent(accumulatedText);

            const sseData = JSON.stringify({
              content: content || accumulatedText,
              thinking: thinking || undefined,
            });
            if (!(await safeWrite(`data: ${sseData}\n\n`))) return;
          }
        } catch (error) {
          console.error('解析最后数据失败:', error);
        }
      }

      await sendDoneSignal(safeWrite, writer, checkClosed());
    } catch (error: any) {
      if (
        error.name === 'AbortError' ||
        error.code === 'ABORT_ERR' ||
        error.code === 'ERR_STREAM_PREMATURE_CLOSE'
      ) {
        console.log('⚠️  [SSE] 客户端主动断开连接');
        markClosed();
      } else {
        console.error('❌ [SSE] 流处理错误:', error);
        if (!checkClosed()) {
          try {
            const errorData = JSON.stringify({ error: error.message });
            await safeWrite(`data: ${errorData}\n\n`);
          } catch (writeError) {
            // 忽略写入错误
          }
        }
      }

      try {
        await writer.close();
      } catch (closeError) {
        // 忽略关闭错误
      }
    } finally {
      // ✅ 保存不完整的回答
      if (!messageSaved && accumulatedText && accumulatedText.trim()) {
        try {
          console.log('💾 [Finally] 保存不完整的回答到数据库，长度:', accumulatedText.length);
          const { thinking, content } = extractThinkingAndContent(accumulatedText);

          const container = getContainer();
          const createMessageUseCase = container.getCreateMessageUseCase();
          const updateConversationUseCase = container.getUpdateConversationUseCase();
          
          await createMessageUseCase.execute(
            conversationId,
            userId,
            'assistant',
            content || accumulatedText,
            clientAssistantMessageId,
            modelType,
            thinking || undefined,
            searchSources || undefined
          );
          
          // 增加消息计数
          const conversation = await container.getGetConversationUseCase().execute(conversationId, userId);
          if (conversation) {
            await updateConversationUseCase.execute(
              conversationId,
              userId,
              { messageCount: conversation.messageCount + 1 }
            );
          }
          console.log('✅ [Finally] 不完整的回答已保存到数据库');
        } catch (dbError) {
          console.error('❌ [Finally] 保存不完整回答失败:', dbError);
        }
      }

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      try {
        onFinally?.();
      } catch (e) {
        // 忽略释放时的异常
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

