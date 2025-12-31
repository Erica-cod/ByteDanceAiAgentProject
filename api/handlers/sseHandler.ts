/**
 * SSE流式处理器
 * 处理单Agent模式的SSE流式响应（本地模型和火山引擎模型）
 */

import { volcengineService } from '../_clean/infrastructure/llm/volcengine-service.js';
import { MessageService } from '../services/messageService.js';
import { ConversationService } from '../services/conversationService.js';
import { MultiToolCallManager } from '../workflows/chatWorkflowIntegration.js';
import { extractToolCallWithRemainder } from '../_clean/shared/utils/json-extractor.js';
import { extractThinkingAndContent } from '../_clean/shared/utils/content-extractor.js';
import { executeToolCall } from '../_clean/infrastructure/tools/tool-executor.js';
import { callLocalModel, callVolcengineModel } from '../_clean/infrastructure/llm/llm-caller.js';
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

  /**
   * SSE 心跳（用于避免反向代理/负载均衡因"空闲超时"断开连接）
   */
  const HEARTBEAT_MS = (() => {
    const n = Number.parseInt(String(process.env.SSE_HEARTBEAT_MS ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : 15000;
  })();

  let buffer = '';
  let accumulatedText = '';
  let lastSentContent = '';
  let lastSentThinking = '';
  
  // 存储搜索来源链接
  let searchSources: Array<{title: string; url: string}> | undefined;

  // 添加连接状态标志
  let isStreamClosed = false;
  
  // 标记消息是否已保存到数据库（避免重复保存）
  let messageSaved = false;
  
  // 安全的写入辅助函数（防止客户端断开后继续写入导致错误日志）
  const safeWrite = async (data: string) => {
    if (isStreamClosed) {
      return false;
    }
    
    try {
      await writer.write(encoder.encode(data));
      return true;
    } catch (error: any) {
      if (error.name === 'AbortError' || error.code === 'ABORT_ERR' || error.code === 'ERR_STREAM_PREMATURE_CLOSE') {
        console.log('⚠️  [SSE] 客户端已关闭连接');
        isStreamClosed = true;
        return false;
      }
      throw error;
    }
  };

  // 异步处理流
  (async () => {
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    try {
      // 首先发送 conversationId（用于前端同步）
      const initData = JSON.stringify({
        conversationId: conversationId,
        type: 'init'
      });
      await safeWrite(`data: ${initData}\n\n`);

      // 启动心跳
      heartbeatTimer = setInterval(() => {
        void safeWrite(`: keep-alive\n\n`);
      }, HEARTBEAT_MS);

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
              const { thinking, content: mainContent } = extractThinkingAndContent(accumulatedText);

              // 立即发送每次更新，确保流式效果
              const sseData = JSON.stringify({
                content: mainContent,
                thinking: thinking || undefined,
              });
              
              console.log('📤 发送到前端:', mainContent.substring(0, 50) + (mainContent.length > 50 ? '...' : ''));
              if (!await safeWrite(`data: ${sseData}\n\n`)) return;
              lastSentContent = mainContent;
              lastSentThinking = thinking;
            }

            // 检查是否完成
            if (line.includes('[DONE]')) {
              console.log('✅ 火山引擎流式响应完成');
              console.log('📝 完整响应内容:', accumulatedText);
              
              // ==================== 多工具调用工作流 ====================
              const workflowManager = new MultiToolCallManager(5);  // 最多5轮
              let currentResponse = accumulatedText;
              let continueLoop = true;
              let loopIteration = 0;
              const MAX_LOOP_ITERATIONS = 10;  // 额外的安全保护
              const MAX_TOTAL_TIME_MS = 120000; // ✅ 新增：总时间限制120秒（防止死循环卡死用户）
              const loopStartTime = Date.now();
              
              // 获取用户的原始问题（用于在工具结果反馈中提醒 AI）
              const originalUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
              
              console.log(`🔄 [Workflow] 开始多工具调用循环，最多 ${MAX_LOOP_ITERATIONS} 次迭代，超时 ${MAX_TOTAL_TIME_MS/1000}s`);
              
              while (continueLoop && loopIteration < MAX_LOOP_ITERATIONS) {
                // ✅ 检查总时间限制（防止死循环）
                const elapsedTime = Date.now() - loopStartTime;
                if (elapsedTime > MAX_TOTAL_TIME_MS) {
                  console.warn(`⏰ [Workflow] 工具调用超时（${elapsedTime}ms），强制结束循环`);
                  break;
                }
                
                loopIteration++;
                console.log(`\n🔁 [Workflow] === 循环迭代 ${loopIteration}/${MAX_LOOP_ITERATIONS} (已用时${Math.round(elapsedTime/1000)}s) ===`);
                console.log(`📝 [Workflow] 当前AI回复内容（前500字符）:\n${currentResponse.substring(0, 500)}...`);
                
                // 处理当前 AI 回复，检测并执行工具
                const workflowResult = await workflowManager.processAIResponse(currentResponse, userId);
                
                if (!workflowResult.hasToolCall) {
                  console.log('⚠️  [Workflow] 本轮没有检测到工具调用');
                  console.log(`📝 [Workflow] AI完整回复:\n${currentResponse}`);
                  console.log('✅ [Workflow] 结束工具调用循环');
                  break;
                }
                
                console.log(`🔧 [Workflow] 第 ${workflowManager.getHistory().length} 轮工具调用: ${workflowResult.toolCall?.tool}`);
                
                // 发送工具调用通知到前端
                const toolCallNotice = JSON.stringify({
                  content: `正在执行工具: ${workflowResult.toolCall?.tool}...`,
                  toolCall: workflowResult.toolCall,
                });
                if (!await safeWrite(`data: ${toolCallNotice}\n\n`)) return;
                
                // 保存搜索来源
                if (workflowResult.toolResult?.sources) {
                  searchSources = workflowResult.toolResult.sources;
                }
                
                // 构建工具结果反馈消息
                let feedbackMessage = '';
                
                // 区分错误和成功的反馈
                if (workflowResult.error) {
                  console.warn(`⚠️  [Workflow] 工具执行出错: ${workflowResult.error}`);
                  
                  // 错误反馈 - 鼓励重试
                  feedbackMessage = `${workflowResult.toolResult?.resultText}\n\n---\n\n`;
                  feedbackMessage += `**用户的原始请求**："${originalUserMessage}"\n\n`;
                  feedbackMessage += `⚠️ 刚才的工具调用有误，请仔细检查错误提示，立即重新生成正确的工具调用。\n`;
                  feedbackMessage += `不要向用户解释错误，而是直接修正并重试。`;
                  
                } else {
                  // 成功反馈 - 根据工具类型指引下一步
                  feedbackMessage = `## 工具执行结果\n\n${workflowResult.toolResult?.resultText}\n\n---\n\n`;
                  
                  // 检测用户请求中的多步骤关键词
                  const hasMultiStepKeywords = /然后|接着|再|之后|并且|同时|最后/.test(originalUserMessage);
                  const hasUpdateKeyword = /修改|更新|改|调整|变更/.test(originalUserMessage);
                  const hasCreateKeyword = /制定|创建|新建|建立/.test(originalUserMessage);
                  const hasSearchKeyword = /搜索|查找|查询|找/.test(originalUserMessage);
                  
                  const toolHistory = workflowManager.getHistory();
                  const completedTools = toolHistory.map(h => h.tool).join(' → ');
                  
                  // 根据工具类型给出更明确的指引
                  if (workflowResult.toolCall?.tool === 'search_web') {
                    feedbackMessage += `**📌 用户的原始请求**："${originalUserMessage}"\n\n`;
                    feedbackMessage += `**✅ 已完成步骤**: ${completedTools}\n\n`;
                    
                    if (hasMultiStepKeywords) {
                      feedbackMessage += `⚠️ **重要**：用户的请求包含多个步骤（"然后"、"再"等关键词），你必须完成所有步骤！\n\n`;
                    }
                    
                    feedbackMessage += `🔍 搜索已完成，现在分析下一步：\n`;
                    
                    if (hasCreateKeyword) {
                      feedbackMessage += `✋ **你必须立即调用 create_plan 工具**创建计划，不要直接回复用户！\n`;
                    } else if (hasUpdateKeyword) {
                      feedbackMessage += `✋ **你必须立即调用 update_plan 工具**更新计划，不要直接回复用户！\n`;
                    } else {
                      feedbackMessage += `如果用户只要求搜索，现在可以总结。否则请继续调用相应工具。\n`;
                    }
                    
                  } else if (workflowResult.toolCall?.tool === 'list_plans') {
                    feedbackMessage += `**📌 用户的原始请求**："${originalUserMessage}"\n\n`;
                    feedbackMessage += `**✅ 已完成步骤**: ${completedTools}\n\n`;
                    feedbackMessage += `**⚠️ 重要：工具返回的数据已包含完整的 tasks 数组！**\n\n`;
                    
                    if (hasMultiStepKeywords) {
                      feedbackMessage += `⚠️ **警告**：用户使用了"然后"等词，说明有多个步骤要完成！\n\n`;
                    }
                    
                    feedbackMessage += `📋 计划列表已获取，现在分析下一步：\n`;
                    
                    if (hasSearchKeyword && !toolHistory.some(h => h.tool === 'search_web')) {
                      feedbackMessage += `✋ **你必须立即调用 search_web 工具**进行搜索，不要直接回复！\n`;
                    } else if (hasUpdateKeyword) {
                      feedbackMessage += `✋ **你必须立即调用 update_plan 工具**（使用上面返回的plan_id），不要直接回复用户！\n`;
                    } else {
                      feedbackMessage += `如果没有其他操作，请直接输出完整JSON（保留tasks数组）。\n`;
                    }
                    
                  } else {
                    feedbackMessage += `**📌 用户的原始请求**："${originalUserMessage}"\n\n`;
                    feedbackMessage += `**✅ 已完成步骤**: ${completedTools}\n\n`;
                    
                    if (hasMultiStepKeywords) {
                      feedbackMessage += `⚠️ 请仔细检查：用户的请求包含多步骤关键词，确认是否还有未完成的操作！\n\n`;
                    }
                    
                    feedbackMessage += `请检查用户的原始请求，如果还有工具需要调用，请立即调用。否则可以总结回复。`;
                  }
                }
                
                // 将工具结果反馈给 AI
                messages.push(
                  { role: 'assistant', content: currentResponse },
                  { role: 'user', content: feedbackMessage }
                );
                
                console.log(`📨 [Workflow] 消息历史长度: ${messages.length}, 准备重新调用 AI`);
                
                // 检查是否应该继续
                console.log(`🔍 [Workflow] 检查是否继续: shouldContinue=${workflowResult.shouldContinue}`);
                if (!workflowResult.shouldContinue) {
                  console.log('⚠️  [Workflow] 工作流指示不继续，退出循环');
                  console.log(`⚠️  [Workflow] 退出原因: ${workflowResult.error || '未知'}`);
                  continueLoop = false;
                  break;
                }
                
                console.log('✅ [Workflow] 工具执行成功，准备继续下一轮...');
                
                // 重新调用 AI 模型
                console.log('🔄 [Workflow] 重新调用 AI 模型...');
                const newStream = await callVolcengineModel(messages);
                
                // 重置累积文本
                currentResponse = '';  // 重置当前回复用于下一轮
                accumulatedText = '';
                lastSentContent = '';
                lastSentThinking = '';
                buffer = '';
                
                // 继续处理新的流
                let newStreamDone = false;
                
                for await (const chunk of newStream) {
                  const chunkStr = chunk.toString();
                  buffer += chunkStr;
                  
                  const lines = buffer.split('\n');
                  buffer = lines.pop() || '';

                  for (const line of lines) {
                    if (line.trim()) {
                      const content = volcengineService.parseStreamLine(line);
                      
                      if (content) {
                        accumulatedText += content;
                        currentResponse += content;  // 累积用于下一轮工具检测
                        const { thinking, content: mainContent } = extractThinkingAndContent(accumulatedText);

                        // 立即发送每次更新，确保流式效果
                        const sseData = JSON.stringify({
                          content: mainContent,
                          thinking: thinking || undefined,
                        });
                        
                        if (!await safeWrite(`data: ${sseData}\n\n`)) return;
                        lastSentContent = mainContent;
                        lastSentThinking = thinking;
                      }

                      if (line.includes('[DONE]')) {
                        newStreamDone = true;
                        console.log('✅ [Workflow] 新流完成');
                        break;
                      }
                    }
                  }
                  
                  if (newStreamDone) break;
                }
                
                // 检查新回复中是否还有工具调用，如果有则继续循环
                if (newStreamDone) {
                  if (currentResponse && currentResponse.trim()) {
                    console.log('🔍 [Workflow] 新流完成，检查是否有更多工具调用...');
                    console.log(`📝 [Workflow] 当前回复长度: ${currentResponse.length} 字符`);
                    // 循环会在下一次迭代时自动检测 tool_call
                  } else {
                    console.log('✅ [Workflow] 新流完成，但没有新内容，结束循环');
                    continueLoop = false;
                  }
                } else {
                  console.warn('⚠️  [Workflow] 新流未正常完成，但保持循环继续');
                }
              }
              
              // 打印工具调用历史和退出原因
              console.log(`\n📊 [Workflow] ============ 工作流结束 ============`);
              console.log(`📊 [Workflow] 工具调用历史: ${workflowManager.getHistorySummary()}`);
              console.log(`📊 [Workflow] 总迭代次数: ${loopIteration}`);
              console.log(`📊 [Workflow] 退出原因: ${!continueLoop ? '不需要继续' : '达到最大迭代次数'}`);
              
              // 最终处理和保存
              if (accumulatedText) {
                const { thinking, content } = extractThinkingAndContent(accumulatedText);
                const sseData = JSON.stringify({
                  content: content || accumulatedText,
                  thinking: thinking || undefined,
                  sources: searchSources || undefined,
                });
                if (!await safeWrite(`data: ${sseData}\n\n`)) return;
                
                // 保存 AI 回复到数据库
                try {
                  console.log('💾 准备保存消息到数据库，searchSources:', searchSources);
                  await MessageService.addMessage(
                    conversationId,
                    userId,
                    'assistant',
                    content || accumulatedText,
                    clientAssistantMessageId,
                    thinking || undefined,
                    modelType,
                    searchSources || undefined  // 保存搜索来源链接
                  );
                  await ConversationService.incrementMessageCount(conversationId, userId);
                  messageSaved = true;  // ✅ 标记已保存
                  console.log('✅ AI完整回答已保存到数据库 with sources:', searchSources?.length || 0);
                } catch (dbError) {
                  console.error('❌ Failed to save AI message:', dbError);
                }
              }
              
              if (!isStreamClosed) {
                await safeWrite('data: [DONE]\n\n');
                await writer.close();
              }
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
          if (!await safeWrite(`data: ${sseData}\n\n`)) return;
        }
      }
      
      if (!isStreamClosed) {
        await safeWrite('data: [DONE]\n\n');
        await writer.close();
      }
    } catch (error: any) {
      // 如果是客户端断开连接，不打印错误日志（这是正常情况）
      if (error.name === 'AbortError' || error.code === 'ABORT_ERR' || error.code === 'ERR_STREAM_PREMATURE_CLOSE') {
        console.log('⚠️  [SSE] 客户端主动断开连接');
      } else {
        console.error('❌ [SSE] 流处理错误:', error);
        // 只有在流没关闭时才尝试发送错误
        if (!isStreamClosed) {
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

  /**
   * SSE 心跳
   */
  const HEARTBEAT_MS = (() => {
    const n = Number.parseInt(String(process.env.SSE_HEARTBEAT_MS ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : 15000;
  })();

  let buffer = '';
  let accumulatedText = '';
  let lastSentContent = '';
  let lastSentThinking = '';
  
  // 存储搜索来源链接
  let searchSources: Array<{title: string; url: string}> | undefined;

  // 添加连接状态标志
  let isStreamClosed = false;
  
  // 标记消息是否已保存到数据库（避免重复保存）
  let messageSaved = false;
  
  // 安全的写入辅助函数
  const safeWrite = async (data: string) => {
    if (isStreamClosed) {
      return false;
    }
    
    try {
      await writer.write(encoder.encode(data));
      return true;
    } catch (error: any) {
      if (error.name === 'AbortError' || error.code === 'ABORT_ERR' || error.code === 'ERR_STREAM_PREMATURE_CLOSE') {
        console.log('⚠️  [SSE] 客户端已关闭连接');
        isStreamClosed = true;
        return false;
      }
      throw error;
    }
  };

  // 异步处理流
  (async () => {
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    try {
      // 首先发送 conversationId
      const initData = JSON.stringify({
        conversationId: conversationId,
        type: 'init'
      });
      await safeWrite(`data: ${initData}\n\n`);

      // 启动心跳
      heartbeatTimer = setInterval(() => {
        void safeWrite(`: keep-alive\n\n`);
      }, HEARTBEAT_MS);
      
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
                  
                  if (!await safeWrite(`data: ${sseData}\n\n`)) return;
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
                  if (!await safeWrite(`data: ${toolCallNotice}\n\n`)) return;
                  
                  // 执行工具调用
                  const { resultText: toolResult, sources } = await executeToolCall(toolCallResult.data, userId);
                  console.log('📦 工具执行结果（前200字符）:', toolResult.substring(0, 200) + '...');
                  console.log('🔗 来源链接:', sources?.length || 0, '条');
                  
                  // 保存 sources，稍后随最终答案一起发送
                  searchSources = sources;
                  
                  // 将工具结果添加到消息历史
                  messages.push(
                    { role: 'assistant', content: accumulatedText },
                    { role: 'user', content: `以下是搜索结果，请基于这些搜索结果回答用户的问题：\n\n${toolResult}\n\n请现在根据上述搜索结果，详细回答用户的问题。` }
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
                            const { thinking, content } = extractThinkingAndContent(accumulatedText);

                            if (content !== lastSentContent || thinking !== lastSentThinking) {
                              const sseData = JSON.stringify({
                                content: content,
                                thinking: thinking || undefined,
                              });
                              
                              if (!await safeWrite(`data: ${sseData}\n\n`)) return;
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
                  if (!await safeWrite(`data: ${sseData}\n\n`)) return;
                  
                  // 保存 AI 回复到数据库
                  try {
                    console.log('💾 准备保存消息到数据库，searchSources:', searchSources);
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
                    messageSaved = true;
                    console.log('✅ AI message saved to database with sources:', searchSources?.length || 0);
                  } catch (dbError) {
                    console.error('❌ Failed to save AI message:', dbError);
                  }
                }
                
                if (!isStreamClosed) {
                  await safeWrite('data: [DONE]\n\n');
                  await writer.close();
                }
                return;
              }
            } catch (error) {
              console.error('解析流数据失败:', error);
            }
          }
        }
      }

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
            if (!await safeWrite(`data: ${sseData}\n\n`)) return;
          }
        } catch (error) {
          console.error('解析最后数据失败:', error);
        }
      }
      
      if (!isStreamClosed) {
        await safeWrite('data: [DONE]\n\n');
        await writer.close();
      }
    } catch (error: any) {
      if (error.name === 'AbortError' || error.code === 'ABORT_ERR' || error.code === 'ERR_STREAM_PREMATURE_CLOSE') {
        console.log('⚠️  [SSE] 客户端主动断开连接');
      } else {
        console.error('❌ [SSE] 流处理错误:', error);
        if (!isStreamClosed) {
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

