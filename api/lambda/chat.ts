/**
 * Chat API - 符合 Modern.js BFF 规范
 * 路由: /api/chat
 * 
 * 支持流式响应 (SSE)
 */

// 加载环境变量
import '../config/env.js';
import type { RequestOption } from '@modern-js/runtime/server';
import { connectToDatabase } from '../db/connection.js';
import { ConversationService } from '../services/conversationService.js';
import { MessageService } from '../services/messageService.js';
import { UserService } from '../services/userService.js';
import { errorResponse } from './_utils/response.js';

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

**重要**：在回答之前，请先在 <think></think> 标签内展示你的思考过程，然后再给出最终回答。

请用友好、鼓励的语气与用户交流，用简洁明了的语言回答问题。`;

// ============= 工具函数 =============

/**
 * 调用本地 Ollama 模型
 */
async function callLocalModel(message: string) {
  const fetch = (await import('node-fetch')).default;
  const modelName = process.env.OLLAMA_MODEL || 'deepseek-r1:7b';
  const ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434';
  
  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
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
 * 为 Hono 处理流式响应并转换为 SSE 格式
 */
async function streamToSSEResponse(
  stream: any, 
  conversationId: string, 
  userId: string, 
  modelType: 'local' | 'volcano'
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
      const stream = await callLocalModel(message);
      
      // 将流式响应转换为 SSE 格式并返回
      return streamToSSEResponse(stream, conversationId, userId, modelType);
    } else if (modelType === 'volcano') {
      return errorResponse('火山云模型接入功能待实现');
    } else {
      return errorResponse('不支持的模型类型');
    }
  } catch (error: any) {
    console.error('处理聊天请求失败:', error);
    return errorResponse(error.message || '服务器内部错误');
  }
}

