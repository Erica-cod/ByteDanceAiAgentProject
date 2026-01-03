/**
 * 单Agent处理器 V2 - 支持 Function Calling
 * 使用新的工具系统 V2 和 Function Calling 机制
 */

import { SSEStreamWriter } from '../utils/sseStreamWriter.js';
import { volcengineService } from '../_clean/infrastructure/llm/volcengine-service.js';
import { extractThinkingAndContent } from '../_clean/shared/utils/content-extractor.js';
import { getContainer } from '../_clean/di-container.js';
import type { ChatMessage } from '../types/chat.js';
import { 
  createLocalControlledWriter,
  createRemoteControlledWriter
} from '../_clean/infrastructure/streaming/controlled-sse-writer.js';
import { StreamProgressManager } from '../_clean/infrastructure/streaming/stream-progress-manager.js';

// ✅ V2: 使用新的工具系统
import { toolRegistry, toolExecutor } from '../tools/v2/index.js';
import { callLocalModelV2, callVolcengineModelV2 } from '../_clean/infrastructure/llm/model-service.v2.js';

/**
 * 保存助手消息到数据库
 */
async function saveMessage(
  conversationId: string,
  userId: string,
  content: string,
  clientAssistantMessageId?: string,
  thinking?: string,
  sources?: Array<{title: string; url: string}>
): Promise<void> {
  const container = getContainer();
  const createMessageUseCase = container.getCreateMessageUseCase();
  
  await createMessageUseCase.execute(
    conversationId,
    userId,
    'assistant',
    content,
    clientAssistantMessageId,
    undefined, // modelType
    thinking,
    sources
  );
}

/**
 * 处理火山引擎流式响应并转换为 SSE 格式（V2 - Function Calling）
 */
export async function handleVolcanoStreamV2(
  stream: any,
  conversationId: string,
  userId: string,
  modelType: 'local' | 'volcano',
  messages: ChatMessage[],
  clientAssistantMessageId?: string,
  onFinally?: () => void,
  requestText?: string
): Promise<Response> {
  console.log('🚀 [V2] handleVolcanoStreamV2 被调用！');
  console.log('🚀 [V2] stream 类型:', typeof stream, stream?.constructor?.name);
  console.log('🚀 [V2] conversationId:', conversationId);
  
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const sseWriter = new SSEStreamWriter(writer);
  
  // ✅ 使用受控 SSE Writer
  const controlledWriter = modelType === 'local' 
    ? createLocalControlledWriter(sseWriter)
    : createRemoteControlledWriter(sseWriter);

  let buffer = '';
  let accumulatedText = '';
  let searchSources: Array<{title: string; url: string}> | undefined;
  let messageSaved = false;

  // ✅ 流式进度管理器
  const messageId = clientAssistantMessageId || `temp_${Date.now()}`;
  const container = getContainer();
  const streamProgressRepo = container.getStreamProgressRepository();
  const progressManager = new StreamProgressManager(streamProgressRepo, {
    updateIntervalMs: 1000,
    updateCharThreshold: 100,
  });


  // 处理流的辅助函数（支持递归调用）
  async function processStream(currentStream: any): Promise<void> {
    console.log('🔍 [V2] 开始处理流...');
    let chunkCount = 0;
    
    for await (const chunk of currentStream) {
      chunkCount++;
      console.log(`🔍 [V2] 收到第 ${chunkCount} 个 chunk, 大小:`, chunk.length);
      
      if (sseWriter.isClosed()) {
        console.log('⚠️  客户端已断开连接，停止处理流');
        return;
      }

      const text = chunk.toString();
      console.log('🔍 [V2] chunk 文本:', text.substring(0, 100));
      buffer += text;

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || line.startsWith(':')) continue;
        if (!line.startsWith('data: ')) continue;

        const data = line.slice(6);
        if (data === '[DONE]') {
          console.log('✅ 流式响应完成');
          continue;
        }

        try {
          const jsonData = JSON.parse(data);
          console.log('🔍 [V2 Debug] 收到响应:', JSON.stringify(jsonData).substring(0, 200));
          
          // 火山引擎格式: choices[0].delta
          const choice = jsonData.choices?.[0];
          if (!choice) {
            console.log('⚠️  [V2 Debug] 没有 choice');
            continue;
          }
          
          const delta = choice.delta;
          if (!delta) {
            console.log('⚠️  [V2 Debug] 没有 delta');
            continue;
          }
          
          console.log('✅ [V2 Debug] delta:', JSON.stringify(delta).substring(0, 200));
          
          // ✅ V2: 检查是否有 tool_calls（Function Calling）
          if (delta.tool_calls && delta.tool_calls.length > 0) {
            console.log('🔧 [V2] 检测到 Function Calling:', delta.tool_calls);
            
            const toolCalls = delta.tool_calls;
            
            // 执行所有工具调用
            for (const toolCall of toolCalls) {
              if (sseWriter.isClosed()) {
                console.log('⚠️  客户端已断开，跳过工具调用');
                return;
              }

              const func = toolCall.function;
              const toolName = func.name;
              let params: any;
              
              try {
                params = JSON.parse(func.arguments);
              } catch (e) {
                console.error('❌ 解析工具参数失败:', e);
                params = {};
              }

              console.log(`🔧 [V2] 执行工具: ${toolName}`, params);

              // 发送工具调用通知
              await controlledWriter.sendEvent('正在执行工具...', {
                toolCall: { tool: toolName, ...params },
              });

              // ✅ V2: 使用新的 toolExecutor
              const context = {
                userId,
                conversationId,
                requestId: clientAssistantMessageId || `req_${Date.now()}`,
                timestamp: Date.now(),
              };

              const result = await toolExecutor.execute(toolName, params, context);

              if (!result.success) {
                console.error(`❌ 工具执行失败: ${result.error}`);
                
                // 将错误信息返回给模型
                messages.push(
                  { role: 'assistant', content: accumulatedText || `使用工具 ${toolName}` },
                  { role: 'user', content: `工具执行失败: ${result.error}` }
                );
              } else {
                console.log(`✅ 工具执行成功 (${result.duration}ms, 缓存: ${result.fromCache})`);
                
                // 保存搜索来源（如果有）
                if (result.data?.sources) {
                  searchSources = result.data.sources;
                }

                // 将工具结果返回给模型
                const resultText = typeof result.data === 'string' 
                  ? result.data 
                  : JSON.stringify(result.data, null, 2);

                messages.push(
                  { role: 'assistant', content: accumulatedText || `使用工具 ${toolName}` },
                  { role: 'user', content: `工具执行结果：\n\n${resultText}\n\n请基于这个结果回答用户的问题。` }
                );
              }
            }

            // 重新调用模型（基于工具结果）
            if (sseWriter.isClosed()) {
              console.log('⚠️  客户端已断开，停止后续调用');
              return;
            }

            console.log('🔄 基于工具结果继续生成...');
            accumulatedText = '';
            buffer = '';
            
            const newStream = modelType === 'local'
              ? await callLocalModelV2(messages, { 
                  tools: toolRegistry.getAllSchemas() 
                })
              : await callVolcengineModelV2(messages, { 
                  tools: toolRegistry.getAllSchemas() 
                });

            // 递归处理新的流
            await processStream(newStream);
            return; // 新流处理完成后退出当前流
          }

          // 处理普通文本流
          const content = delta.content || '';
          if (content) {
            accumulatedText += content;

            // 提取 thinking 和实际内容
            const { thinking, content: mainContent } = extractThinkingAndContent(accumulatedText);

            if (!sseWriter.isClosed()) {
              await controlledWriter.sendEvent(mainContent, {
                thinking: thinking || undefined,
              });
            }
          }

          // 处理完成
          if (choice.finish_reason === 'stop' || choice.finish_reason === 'tool_calls') {
            console.log('✅ 模型响应完成 (finish_reason:', choice.finish_reason, ')');
            
            // 保存消息到数据库
            if (!messageSaved && accumulatedText) {
              messageSaved = true;
              try {
                const { thinking } = extractThinkingAndContent(accumulatedText);
                await saveMessage(
                  conversationId,
                  userId,
                  accumulatedText,
                  clientAssistantMessageId,
                  thinking,
                  searchSources
                );
                console.log(`💾 助手消息已保存: ${clientAssistantMessageId}`);
              } catch (error) {
                console.error('❌ 保存助手消息失败:', error);
              }
            }

            // 发送完成信号
            if (!sseWriter.isClosed()) {
              await controlledWriter.sendDirect({
                done: true,
                assistantMessageId: clientAssistantMessageId,
                sources: searchSources,
              });
            }
          }

        } catch (e) {
          console.error('解析 JSON 失败:', e);
        }
      }
    }
  }

  // 异步处理流
  (async () => {
    try {
      // ✅ 发送初始化数据
      if (!sseWriter.isClosed()) {
        await controlledWriter.sendDirect({
          conversationId,
          assistantMessageId: clientAssistantMessageId,
          type: 'init',
        });
      }

      // ✅ 启动心跳
      sseWriter.startHeartbeat(15000);

      // 开始处理流
      console.log('🔍 [V2] 准备调用 processStream...');
      await processStream(stream);
      console.log('🔍 [V2] processStream 执行完成');

    } catch (error: any) {
      console.error('❌ 流处理错误:', error);
      
      if (!sseWriter.isClosed()) {
        await controlledWriter.sendDirect({
          error: '处理失败',
          message: error.message,
        });
      }
    } finally {
      // 清理
      sseWriter.stopHeartbeat();
      await sseWriter.close();
      
      if (onFinally) {
        onFinally();
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
 * 处理本地模型流式响应并转换为 SSE 格式（V2 - Function Calling）
 */
export async function handleLocalStreamV2(
  stream: any,
  conversationId: string,
  userId: string,
  modelType: 'local' | 'volcano',
  messages: ChatMessage[],
  clientAssistantMessageId?: string,
  onFinally?: () => void,
  requestText?: string
): Promise<Response> {
  // 本地模型和火山引擎模型使用相同的处理逻辑
  return handleVolcanoStreamV2(
    stream,
    conversationId,
    userId,
    modelType,
    messages,
    clientAssistantMessageId,
    onFinally,
    requestText
  );
}
