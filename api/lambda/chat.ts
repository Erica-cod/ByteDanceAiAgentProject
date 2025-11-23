/**
 * Chat API - 符合 Modern.js BFF 规范
 * 路由: /api/chat
 * 
 * 支持流式响应 (SSE)
 */

// 加载环境变量
import '../config/env.js';
import { connectToDatabase } from '../db/connection.js';
import { ConversationService } from '../services/conversationService.js';
import { MessageService } from '../services/messageService.js';
import { UserService } from '../services/userService.js';
import { errorResponse } from './_utils/response.js';
import { searchWeb, formatSearchResultsForAI, type SearchOptions } from '../tools/tavilySearch.js';
import { volcengineService, type VolcengineMessage } from '../services/volcengineService.js';

// 请求选项类型
interface RequestOption<Q = any, D = any> {
  query?: Q;
  data?: D;
  params?: Record<string, string>;
  headers?: Record<string, string>;
}

// Initialize database connection
connectToDatabase().catch(console.error);

// ============= 类型定义 =============

interface ChatRequestData {
  message: string;
  modelType: 'local' | 'volcano';
  conversationId?: string;
  userId: string;
}

// ============= System Prompt =============

const SYSTEM_PROMPT = `你是一位专业的兴趣教练，擅长帮助用户发现、培养和深化他们的兴趣爱好。你的目标是：

1. 通过提问了解用户的兴趣倾向和个性特点
2. 提供个性化的兴趣建议和培养方案
3. 分享相关的资源和学习路径
4. 鼓励用户坚持并享受兴趣带来的乐趣

## 工具使用

你可以使用以下工具来获取实时信息：

### search_web - 联网搜索工具
当你需要查找最新信息、资源、教程或数据时，使用此工具。

使用方法：在回答中使用以下格式：
<tool_call>
{
  "tool": "search_web",
  "query": "你的搜索查询",
  "options": {
    "maxResults": 5
  }
}
</tool_call>

例如：
- 用户问："最近有什么好的摄影教程？"
- 你可以这样回答："<tool_call>{"tool": "search_web", "query": "2024年最新摄影教程推荐"}</tool_call>"

**重要**：
1. 在回答之前，请先在 <think></think> 标签内展示你的思考过程
2. 如果需要搜索，在思考后直接使用 <tool_call> 标签
3. 收到搜索结果后，基于搜索结果给出最终回答

请用友好、鼓励的语气与用户交流，用简洁明了的语言回答问题。`;

// ============= 工具函数 =============

/**
 * 消息历史接口
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 调用本地 Ollama 模型
 */
async function callLocalModel(messages: ChatMessage[]) {
  const fetch = (await import('node-fetch')).default;
  const modelName = process.env.OLLAMA_MODEL || 'deepseek-r1:7b';
  const ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434';
  
  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      messages,
      stream: true,
      keep_alive: '30m', // 保持模型在内存中 30 分钟，避免频繁重新加载
      // 强制使用 GPU - 所有层都加载到 GPU
      options: {
        num_gpu: 999,  // 强制所有层使用 GPU（999 表示尽可能多）
      }
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API 错误: ${response.statusText}`);
  }

  return response.body;
}

/**
 * 调用火山引擎豆包大模型
 */
async function callVolcengineModel(messages: ChatMessage[]) {
  // 转换消息格式（保持兼容）
  const volcengineMessages: VolcengineMessage[] = messages.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));

  console.log('🔥 调用火山引擎豆包模型...');
  const stream = await volcengineService.chat(volcengineMessages, {
    temperature: 0.7,
    maxTokens: 4000,
    topP: 0.95,
  });

  return stream;
}

/**
 * 提取工具调用（处理 <tool_call> 标签）
 */
function extractToolCall(text: string): { toolCall: any; remainingText: string } | null {
  const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/;
  const match = text.match(toolCallRegex);
  
  if (match) {
    try {
      const toolCallJson = match[1].trim();
      const toolCall = JSON.parse(toolCallJson);
      const remainingText = text.replace(match[0], '').trim();
      return { toolCall, remainingText };
    } catch (error) {
      console.error('解析工具调用失败:', error);
      return null;
    }
  }
  
  return null;
}

/**
 * 执行工具调用
 */
async function executeToolCall(toolCall: any): Promise<string> {
  const { tool, query, options } = toolCall;
  
  if (tool === 'search_web') {
    console.log(`🔍 执行搜索: "${query}"`);
    try {
      const searchOptions: SearchOptions = {
        maxResults: options?.maxResults || 5,
        searchDepth: options?.searchDepth || 'basic',
      };
      
      const { results } = await searchWeb(query, searchOptions);
      const formattedResults = formatSearchResultsForAI(results);
      
      return `<search_results>\n${formattedResults}\n</search_results>`;
    } catch (error: any) {
      console.error('❌ 搜索执行失败:', error);
      return `<search_error>搜索失败: ${error.message}</search_error>`;
    }
  }
  
  return `<tool_error>未知的工具: ${tool}</tool_error>`;
}

/**
 * 提取 thinking 内容（处理 <think> 标签）
 */
function extractThinkingAndContent(text: string) {
  let thinking = '';
  let content = text;

  // 检查是否有完整的 thinking 标签对
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  const thinkMatches = text.match(thinkRegex);
  
  if (thinkMatches) {
    // 有完整的闭合标签，提取 thinking 内容
    thinking = thinkMatches.map(match => {
      return match.replace(/<\/?think>/g, '').trim();
    }).join('\n\n');
    
    // 移除 thinking 标签，保留纯内容
    content = text.replace(thinkRegex, '').trim();
  } else if (text.includes('<think>')) {
    // 有开始标签但没有结束标签（流式输出中）
    const thinkStartIndex = text.indexOf('<think>');
    const textBeforeThink = text.substring(0, thinkStartIndex).trim();
    
    // 提取 <think> 之后的内容作为实时 thinking
    const thinkingInProgress = text.substring(thinkStartIndex + 7); // 7 是 '<think>' 的长度
    
    // 实时显示思考过程
    thinking = thinkingInProgress.trim() || '正在开始思考...';
    
    // content 显示 <think> 之前的内容
    content = textBeforeThink;
  }

  return { thinking, content };
}

/**
 * 处理火山引擎流式响应并转换为 SSE 格式
 */
async function streamVolcengineToSSEResponse(
  stream: any,
  conversationId: string,
  userId: string,
  modelType: 'local' | 'volcano',
  messages: ChatMessage[]
) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  let buffer = '';
  let accumulatedText = '';
  let lastSentContent = '';
  let lastSentThinking = '';

  // 异步处理流
  (async () => {
    try {
      // 首先发送 conversationId（用于前端同步）
      const initData = JSON.stringify({
        conversationId: conversationId,
        type: 'init'
      });
      await writer.write(encoder.encode(`data: ${initData}\n\n`));

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
              await writer.write(encoder.encode(`data: ${sseData}\n\n`));
              lastSentContent = mainContent;
              lastSentThinking = thinking;
            }

            // 检查是否完成
            if (line.includes('[DONE]')) {
              // 检测是否有工具调用
              const toolCallResult = extractToolCall(accumulatedText);
              
              if (toolCallResult) {
                console.log('🔧 检测到工具调用:', toolCallResult.toolCall);
                
                // 发送工具调用通知
                const toolCallNotice = JSON.stringify({
                  content: '正在搜索...',
                  toolCall: toolCallResult.toolCall,
                });
                await writer.write(encoder.encode(`data: ${toolCallNotice}\n\n`));
                
                // 执行工具调用
                const toolResult = await executeToolCall(toolCallResult.toolCall);
                
                // 将工具结果添加到消息历史
                messages.push(
                  { role: 'assistant', content: accumulatedText },
                  { role: 'user', content: toolResult }
                );
                
                // 重新调用模型，继续生成
                console.log('🔄 基于搜索结果继续生成回答...');
                const newStream = await callVolcengineModel(messages);
                
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
                      const content = volcengineService.parseStreamLine(line);
                      
                      if (content) {
                        accumulatedText += content;
                        const { thinking, content: mainContent } = extractThinkingAndContent(accumulatedText);

                        // 立即发送每次更新，确保流式效果
                        const sseData = JSON.stringify({
                          content: mainContent,
                          thinking: thinking || undefined,
                        });
                        
                        await writer.write(encoder.encode(`data: ${sseData}\n\n`));
                        lastSentContent = mainContent;
                        lastSentThinking = thinking;
                      }

                      if (line.includes('[DONE]')) {
                        break;
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
                });
                await writer.write(encoder.encode(`data: ${sseData}\n\n`));
                
                // 保存 AI 回复到数据库
                try {
                  await MessageService.addMessage(
                    conversationId,
                    userId,
                    'assistant',
                    content || accumulatedText,
                    thinking || undefined,
                    modelType
                  );
                  await ConversationService.incrementMessageCount(conversationId, userId);
                  console.log('✅ AI message saved to database');
                } catch (dbError) {
                  console.error('❌ Failed to save AI message:', dbError);
                }
              }
              
              await writer.write(encoder.encode('data: [DONE]\n\n'));
              await writer.close();
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
          await writer.write(encoder.encode(`data: ${sseData}\n\n`));
        }
      }
      
      await writer.write(encoder.encode('data: [DONE]\n\n'));
      await writer.close();
    } catch (error: any) {
      console.error('流处理错误:', error);
      const errorData = JSON.stringify({ error: error.message });
      await writer.write(encoder.encode(`data: ${errorData}\n\n`));
      await writer.close();
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
 * 为 Hono 处理流式响应并转换为 SSE 格式
 */
async function streamToSSEResponse(
  stream: any, 
  conversationId: string, 
  userId: string, 
  modelType: 'local' | 'volcano',
  messages: ChatMessage[]
) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  let buffer = '';
  let accumulatedText = '';
  let lastSentContent = '';
  let lastSentThinking = '';

  // 异步处理流
  (async () => {
    try {
      // 首先发送 conversationId（用于前端同步）
      const initData = JSON.stringify({
        conversationId: conversationId,
        type: 'init'
      });
      await writer.write(encoder.encode(`data: ${initData}\n\n`));
      
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
                  
                  await writer.write(encoder.encode(`data: ${sseData}\n\n`));
                  lastSentContent = content;
                  lastSentThinking = thinking;
                }
              }

              if (jsonData.done) {
                // 检测是否有工具调用
                const toolCallResult = extractToolCall(accumulatedText);
                
                if (toolCallResult) {
                  console.log('🔧 检测到工具调用:', toolCallResult.toolCall);
                  
                  // 发送工具调用通知
                  const toolCallNotice = JSON.stringify({
                    content: '正在搜索...',
                    toolCall: toolCallResult.toolCall,
                  });
                  await writer.write(encoder.encode(`data: ${toolCallNotice}\n\n`));
                  
                  // 执行工具调用
                  const toolResult = await executeToolCall(toolCallResult.toolCall);
                  
                  // 将工具结果添加到消息历史
                  messages.push(
                    { role: 'assistant', content: accumulatedText },
                    { role: 'user', content: toolResult }
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
                              
                              await writer.write(encoder.encode(`data: ${sseData}\n\n`));
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
                  });
                  await writer.write(encoder.encode(`data: ${sseData}\n\n`));
                  
                  // 保存 AI 回复到数据库
                  try {
                    await MessageService.addMessage(
                      conversationId,
                      userId,
                      'assistant',
                      content || accumulatedText,
                      thinking || undefined,
                      modelType
                    );
                    await ConversationService.incrementMessageCount(conversationId, userId);
                    console.log('✅ AI message saved to database');
                  } catch (dbError) {
                    console.error('❌ Failed to save AI message:', dbError);
                  }
                }
                
                await writer.write(encoder.encode('data: [DONE]\n\n'));
                await writer.close();
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
            await writer.write(encoder.encode(`data: ${sseData}\n\n`));
          }
        } catch (error) {
          console.error('解析最后数据失败:', error);
        }
      }
      
      await writer.write(encoder.encode('data: [DONE]\n\n'));
      await writer.close();
    } catch (error: any) {
      console.error('流处理错误:', error);
      const errorData = JSON.stringify({ error: error.message });
      await writer.write(encoder.encode(`data: ${errorData}\n\n`));
      await writer.close();
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

// ============= API 函数 =============

/**
 * POST /api/chat - 发送聊天消息（流式响应）
 * 
 * @param data - 请求数据 { message, modelType, conversationId?, userId }
 * @returns SSE 流式响应
 */
export async function post({
  data,
}: RequestOption<any, ChatRequestData>) {
  try {
    console.log('=== 收到聊天请求 ===');
    
    const { message, modelType, conversationId: reqConversationId, userId } = data;

    console.log('解析后的 message:', message);
    console.log('解析后的 modelType:', modelType);
    console.log('解析后的 conversationId:', reqConversationId);
    console.log('解析后的 userId:', userId);

    // 参数验证
    if (!message || !message.trim()) {
      console.log('消息内容为空');
      return errorResponse('消息内容不能为空');
    }

    if (!userId) {
      return errorResponse('userId is required');
    }

    // 确保用户存在
    await UserService.getOrCreateUser(userId);

    // 如果没有 conversationId，创建新对话
    let conversationId = reqConversationId;
    if (!conversationId) {
      const conversation = await ConversationService.createConversation(
        userId,
        message.slice(0, 50) + (message.length > 50 ? '...' : '') // 使用前50个字符作为标题
      );
      conversationId = conversation.conversationId;
      console.log('✅ Created new conversation:', conversationId);
    }

    // 保存用户消息到数据库
    try {
      await MessageService.addMessage(
        conversationId,
        userId,
        'user',
        message,
        undefined,
        modelType
      );
      await ConversationService.incrementMessageCount(conversationId, userId);
      console.log('✅ User message saved to database');
    } catch (dbError) {
      console.error('❌ Failed to save user message:', dbError);
      // 继续处理，不阻止 AI 回复
    }

    // 调用模型
    if (modelType === 'local') {
      console.log('开始调用本地模型...');
      
      // 构建消息历史
      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message },
      ];
      
      const stream = await callLocalModel(messages);
      
      // 将流式响应转换为 SSE 格式并返回
      return streamToSSEResponse(stream, conversationId, userId, modelType, messages);
    } else if (modelType === 'volcano') {
      console.log('==========================================');
      console.log('🌋 开始调用火山引擎豆包模型...');
      console.log('🔑 ARK_API_KEY 配置状态:', volcengineService.isConfigured() ? '已配置' : '未配置');
      console.log('🎯 目标模型:', process.env.ARK_MODEL || 'doubao-1-5-thinking-pro-250415');
      console.log('🌐 API 端点:', process.env.ARK_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions');
      console.log('==========================================');
      
      // 检查配置
      if (!volcengineService.isConfigured()) {
        console.error('❌ 火山引擎 API 未配置！');
        return errorResponse('火山引擎 API 未配置，请设置 ARK_API_KEY 环境变量');
      }

      // 构建消息历史
      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message },
      ];
      
      console.log('📨 准备发送消息到火山引擎，消息数量:', messages.length);
      const stream = await callVolcengineModel(messages);
      console.log('✅ 已收到火山引擎的流式响应');
      
      // 将流式响应转换为 SSE 格式并返回
      return streamVolcengineToSSEResponse(stream, conversationId, userId, modelType, messages);
    } else {
      return errorResponse('不支持的模型类型');
    }
  } catch (error: any) {
    console.error('处理聊天请求失败:', error);
    return errorResponse(error.message || '服务器内部错误');
  }
}

