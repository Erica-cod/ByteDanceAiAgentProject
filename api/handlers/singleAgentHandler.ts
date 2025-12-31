/**
 * 单Agent处理器
 * 处理单Agent模式的SSE流式响应（支持工具调用）
 */

import { SSEStreamWriter } from '../utils/sseStreamWriter.js';
import { volcengineService } from '../_clean/infrastructure/llm/volcengine-service.js';
import { MessageService } from '../services/messageService.js';
import { ConversationService } from '../services/conversationService.js';
import { extractThinkingAndContent } from '../_clean/shared/utils/content-extractor.js';
import { MultiToolCallManager } from '../workflows/chatWorkflowIntegration.js';
import { executeToolCall } from '../tools/toolExecutor.js';
import { extractToolCallWithRemainder } from '../_clean/shared/utils/json-extractor.js';
import { callLocalModel, callVolcengineModel } from '../_clean/infrastructure/llm/model-service.js';
import type { ChatMessage } from '../types/chat.js';

/**
 * 处理火山引擎流式响应并转换为 SSE 格式
 */
export async function handleVolcanoStream(
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
  const sseWriter = new SSEStreamWriter(writer);

  let buffer = '';
  let accumulatedText = '';
  let searchSources: Array<{title: string; url: string}> | undefined;
  let messageSaved = false;

  // 异步处理流
  (async () => {
    try {
      // 发送初始化事件
      await sseWriter.sendEvent({
        conversationId,
        type: 'init'
      });

      // 启动心跳
      sseWriter.startHeartbeat(15000);

      for await (const chunk of stream) {
        // ✅ 关键修复：检测连接断开，立即停止读取
        if (sseWriter.isClosed()) {
          console.log('⚠️  [Volcano] 客户端已断开，停止读取模型流');
          // 主动中断上游流（Web Streams API）
          try {
            const readableStream = stream as any;
            if (readableStream.cancel && typeof readableStream.cancel === 'function') {
              await readableStream.cancel();
            }
          } catch (e) {
            // 忽略取消错误
          }
          return;
        }
        const chunkStr = chunk.toString();
        buffer += chunkStr;
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            const content = volcengineService.parseStreamLine(line);
            
            if (content) {
              accumulatedText += content;
              const { thinking, content: mainContent } = extractThinkingAndContent(accumulatedText);

              await sseWriter.sendEvent({
                content: mainContent,
                thinking: thinking || undefined,
              });
            }

            // 检查是否完成
            if (line.includes('[DONE]')) {
              console.log('✅ 火山引擎流式响应完成');
              
              // ✅ 在工具调用前检查连接
              if (sseWriter.isClosed()) {
                console.log('⚠️  [Volcano] 完成前客户端已断开，跳过工具调用');
                return;
              }
              
              // 多工具调用工作流（传递连接检查器）
              const workflowResult = await processToolCallWorkflow(
                accumulatedText,
                userId,
                messages,
                sseWriter,
                () => !sseWriter.isClosed() // ✅ 连接检查器
              );
              
              if (workflowResult) {
                accumulatedText = workflowResult.finalResponse;
                searchSources = workflowResult.sources;
              }
              
              // 最终处理和保存
              if (accumulatedText) {
                const { thinking, content } = extractThinkingAndContent(accumulatedText);
                await sseWriter.sendEvent({
                  content: content || accumulatedText,
                  thinking: thinking || undefined,
                  sources: searchSources || undefined,
                });
                
                // 保存到数据库
                await saveMessage(
                  conversationId,
                  userId,
                  content || accumulatedText,
                  clientAssistantMessageId,
                  thinking,
                  modelType,
                  searchSources
                );
                messageSaved = true;
              }
              
              await sseWriter.close();
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
          
          await sseWriter.sendEvent({
            content: mainContent || accumulatedText,
            thinking: thinking || undefined,
          });
        }
      }
      
      await sseWriter.close();
    } catch (error: any) {
      console.error('❌ [SSE] 流处理错误:', error);
      
      if (!sseWriter.isClosed()) {
        await sseWriter.sendEvent({ error: error.message });
      }
      
      await sseWriter.close();
    } finally {
      // 保存不完整的回答
      if (!messageSaved && accumulatedText && accumulatedText.trim()) {
        try {
          const { thinking, content } = extractThinkingAndContent(accumulatedText);
          await saveMessage(
            conversationId,
            userId,
            content || accumulatedText,
            clientAssistantMessageId,
            thinking,
            modelType,
            searchSources
          );
        } catch (dbError) {
          console.error('❌ [Finally] 保存不完整回答失败:', dbError);
        }
      }
      
      onFinally?.();
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

/**
 * 处理本地模型流式响应并转换为 SSE 格式
 */
export async function handleLocalStream(
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
  const sseWriter = new SSEStreamWriter(writer);

  let buffer = '';
  let accumulatedText = '';
  let searchSources: Array<{title: string; url: string}> | undefined;
  let messageSaved = false;

  // 异步处理流
  (async () => {
    try {
      // 发送初始化事件
      await sseWriter.sendEvent({
        conversationId,
        type: 'init'
      });

      // 启动心跳
      sseWriter.startHeartbeat(15000);
      
      for await (const chunk of stream) {
        // ✅ 关键修复：检测连接断开，立即停止读取
        if (sseWriter.isClosed()) {
          console.log('⚠️  [Local] 客户端已断开，停止读取模型流');
          // 主动中断上游流
          try {
            const readableStream = stream as any;
            if (readableStream.cancel && typeof readableStream.cancel === 'function') {
              await readableStream.cancel();
            }
          } catch (e) {
            // 忽略取消错误
          }
          return;
        }
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

                await sseWriter.sendEvent({
                  content: content,
                  thinking: thinking || undefined,
                });
              }

              if (jsonData.done) {
                console.log('✅ 本地模型流式响应完成');
                
                // 检测工具调用
                const toolCallResult = extractToolCallWithRemainder(accumulatedText);
                
                if (toolCallResult) {
                  console.log('🔧 [本地模型] 检测到工具调用:', toolCallResult.data);
                  
                  // ✅ 工具调用前检查连接
                  if (sseWriter.isClosed()) {
                    console.log('⚠️  [Local] 客户端已断开，跳过工具调用');
                    return;
                  }
                  
                  // 执行工具调用
                  const { resultText, sources } = await executeToolCall(toolCallResult.data, userId);
                  searchSources = sources;
                  
                  // ✅ 工具执行后再次检查连接
                  if (sseWriter.isClosed()) {
                    console.log('⚠️  [Local] 工具执行期间客户端已断开，停止后续调用');
                    return;
                  }
                  
                  // 将工具结果添加到消息历史
                  messages.push(
                    { role: 'assistant', content: accumulatedText },
                    { role: 'user', content: `以下是搜索结果，请基于这些搜索结果回答用户的问题：\n\n${resultText}\n\n请现在根据上述搜索结果，详细回答用户的问题。` }
                  );
                  
                  // 重新调用模型（不传 signal，因为这里无法创建新的 AbortController）
                  const newStream = await callLocalModel(messages);
                  
                  // 重置累积文本
                  accumulatedText = '';
                  buffer = '';
                  
                  // 继续处理新的流
                  for await (const newChunk of newStream) {
                    // ✅ 二次调用中也要检查连接
                    if (sseWriter.isClosed()) {
                      console.log('⚠️  [Local] 二次调用期间客户端已断开');
                      try {
                        const readableStream = newStream as any;
                        if (readableStream.cancel && typeof readableStream.cancel === 'function') {
                          await readableStream.cancel();
                        }
                      } catch (e) {
                        // 忽略取消错误
                      }
                      return;
                    }
                    
                    const newChunkStr = newChunk.toString();
                    buffer += newChunkStr;
                    
                    const newLines = buffer.split('\n');
                    buffer = newLines.pop() || '';

                    for (const newLine of newLines) {
                      if (newLine.trim()) {
                        try {
                          const newJsonData = JSON.parse(newLine);

                          if (newJsonData.message && newJsonData.message.content !== undefined) {
                            accumulatedText += newJsonData.message.content;
                            const { thinking, content } = extractThinkingAndContent(accumulatedText);

                            await sseWriter.sendEvent({
                              content: content,
                              thinking: thinking || undefined,
                            });
                          }

                          if (newJsonData.done) {
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
                  await sseWriter.sendEvent({
                    content: content || accumulatedText,
                    thinking: thinking || undefined,
                    sources: searchSources || undefined,
                  });
                  
                  // 保存到数据库
                  await saveMessage(
                    conversationId,
                    userId,
                    content || accumulatedText,
                    clientAssistantMessageId,
                    thinking,
                    modelType,
                    searchSources
                  );
                  messageSaved = true;
                }
                
                await sseWriter.close();
                return;
              }
            } catch (error) {
              console.error('解析流数据失败:', error);
            }
          }
        }
      }

      await sseWriter.close();
    } catch (error: any) {
      console.error('❌ [SSE] 流处理错误:', error);
      
      if (!sseWriter.isClosed()) {
        await sseWriter.sendEvent({ error: error.message });
      }
      
      await sseWriter.close();
    } finally {
      // 保存不完整的回答
      if (!messageSaved && accumulatedText && accumulatedText.trim()) {
        try {
          const { thinking, content } = extractThinkingAndContent(accumulatedText);
          await saveMessage(
            conversationId,
            userId,
            content || accumulatedText,
            clientAssistantMessageId,
            thinking,
            modelType,
            searchSources
          );
        } catch (dbError) {
          console.error('❌ [Finally] 保存不完整回答失败:', dbError);
        }
      }
      
      onFinally?.();
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

/**
 * 处理工具调用工作流（多轮工具调用）
 */
async function processToolCallWorkflow(
  initialResponse: string,
  userId: string,
  messages: ChatMessage[],
  sseWriter: SSEStreamWriter,
  connectionChecker?: () => boolean // ✅ 新增：连接检查器
): Promise<{ finalResponse: string; sources?: Array<{title: string; url: string}> } | null> {
  const workflowManager = new MultiToolCallManager(5);
  let currentResponse = initialResponse;
  let searchSources: Array<{title: string; url: string}> | undefined;
  let continueLoop = true;
  let loopIteration = 0;
  const MAX_LOOP_ITERATIONS = 10;
  const MAX_TOTAL_TIME_MS = 120000; // 总时间限制120秒
  const loopStartTime = Date.now();
  
  const originalUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
  
  while (continueLoop && loopIteration < MAX_LOOP_ITERATIONS) {
    // ✅ 关键修复：检查连接状态
    if (connectionChecker && !connectionChecker()) {
      console.log('⚠️  [Workflow] 客户端已断开，停止工具调用循环');
      return { finalResponse: currentResponse, sources: searchSources };
    }
    
    // ✅ 检查总时间限制
    const elapsedTime = Date.now() - loopStartTime;
    if (elapsedTime > MAX_TOTAL_TIME_MS) {
      console.warn(`⏰ [Workflow] 工具调用超时（${elapsedTime}ms），强制结束循环`);
      break;
    }
    
    loopIteration++;
    
    const workflowResult = await workflowManager.processAIResponse(currentResponse, userId);
    
    if (!workflowResult.hasToolCall) {
      break;
    }
    
    // ✅ 工具执行前再次检查连接
    if (connectionChecker && !connectionChecker()) {
      console.log('⚠️  [Workflow] 工具执行前客户端已断开');
      return { finalResponse: currentResponse, sources: searchSources };
    }
    
    // 发送工具调用通知
    await sseWriter.sendEvent({
      content: `正在执行工具: ${workflowResult.toolCall?.tool}...`,
      toolCall: workflowResult.toolCall,
    });
    
    // 保存搜索来源
    if (workflowResult.toolResult?.sources) {
      searchSources = workflowResult.toolResult.sources;
    }
    
    // 构建工具结果反馈消息
    const feedbackMessage = buildToolFeedbackMessage(
      workflowResult,
      originalUserMessage,
      workflowManager.getHistory()
    );
    
    // 将工具结果反馈给 AI
    messages.push(
      { role: 'assistant', content: currentResponse },
      { role: 'user', content: feedbackMessage }
    );
    
    if (!workflowResult.shouldContinue) {
      continueLoop = false;
      break;
    }
    
    // ✅ 二次调用前检查连接
    if (connectionChecker && !connectionChecker()) {
      console.log('⚠️  [Workflow] 二次调用前客户端已断开');
      return { finalResponse: currentResponse, sources: searchSources };
    }
    
    // 重新调用 AI 模型（不传 signal，因为无法共享 AbortController）
    const newStream = await callVolcengineModel(messages);
    
    // 重置累积文本
    currentResponse = '';
    let buffer = '';
    
    // 继续处理新的流
    for await (const chunk of newStream) {
      // ✅ 二次调用中也要检查连接
      if (connectionChecker && !connectionChecker()) {
        console.log('⚠️  [Workflow] 二次调用期间客户端已断开');
        try {
          const readableStream = newStream as any;
          if (readableStream.cancel && typeof readableStream.cancel === 'function') {
            await readableStream.cancel();
          }
        } catch (e) {
          // 忽略取消错误
        }
        return { finalResponse: currentResponse, sources: searchSources };
      }
      
      const chunkStr = chunk.toString();
      buffer += chunkStr;
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          const content = volcengineService.parseStreamLine(line);
          
          if (content) {
            currentResponse += content;
            const { thinking, content: mainContent } = extractThinkingAndContent(currentResponse);

            await sseWriter.sendEvent({
              content: mainContent,
              thinking: thinking || undefined,
            });
          }

          if (line.includes('[DONE]')) {
            break;
          }
        }
      }
    }
  }
  
  return { finalResponse: currentResponse, sources: searchSources };
}

/**
 * 构建工具反馈消息
 */
function buildToolFeedbackMessage(
  workflowResult: any,
  originalUserMessage: string,
  toolHistory: any[]
): string {
  const completedTools = toolHistory.map(h => h.tool).join(' → ');
  
  let feedbackMessage = '';
  
  if (workflowResult.error) {
    feedbackMessage = `${workflowResult.toolResult?.resultText}\n\n---\n\n`;
    feedbackMessage += `**用户的原始请求**："${originalUserMessage}"\n\n`;
    feedbackMessage += `⚠️ 刚才的工具调用有误，请仔细检查错误提示，立即重新生成正确的工具调用。\n`;
    feedbackMessage += `不要向用户解释错误，而是直接修正并重试。`;
  } else {
    feedbackMessage = `## 工具执行结果\n\n${workflowResult.toolResult?.resultText}\n\n---\n\n`;
    feedbackMessage += `**📌 用户的原始请求**："${originalUserMessage}"\n\n`;
    feedbackMessage += `**✅ 已完成步骤**: ${completedTools}\n\n`;
    
    // 根据工具类型给出更明确的指引
    const hasMultiStepKeywords = /然后|接着|再|之后|并且|同时|最后/.test(originalUserMessage);
    const hasUpdateKeyword = /修改|更新|改|调整|变更/.test(originalUserMessage);
    const hasCreateKeyword = /制定|创建|新建|建立/.test(originalUserMessage);
    
    if (hasMultiStepKeywords) {
      feedbackMessage += `⚠️ **重要**：用户的请求包含多个步骤（"然后"、"再"等关键词），你必须完成所有步骤！\n\n`;
    }
    
    if (workflowResult.toolCall?.tool === 'search_web') {
      feedbackMessage += `🔍 搜索已完成，现在分析下一步：\n`;
      if (hasCreateKeyword) {
        feedbackMessage += `✋ **你必须立即调用 create_plan 工具**创建计划，不要直接回复用户！\n`;
      } else if (hasUpdateKeyword) {
        feedbackMessage += `✋ **你必须立即调用 update_plan 工具**更新计划，不要直接回复用户！\n`;
      }
    }
  }
  
  return feedbackMessage;
}

/**
 * 保存消息到数据库（抽取公共逻辑）
 */
async function saveMessage(
  conversationId: string,
  userId: string,
  content: string,
  clientAssistantMessageId?: string,
  thinking?: string,
  modelType?: 'local' | 'volcano',
  sources?: Array<{title: string; url: string}>
): Promise<void> {
  await MessageService.addMessage(
    conversationId,
    userId,
    'assistant',
    content,
    clientAssistantMessageId,
    thinking,
    modelType,
    sources
  );
  await ConversationService.incrementMessageCount(conversationId, userId);
  console.log('✅ 消息已保存到数据库');
}

