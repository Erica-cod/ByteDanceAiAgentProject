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
import { ConversationMemoryService } from '../services/conversationMemoryService.js';
import { getRecommendedConfig } from '../config/memoryConfig.js';
import { validateToolCall, generateToolPrompt } from '../tools/toolValidator.js';
import { routePlanningTool } from '../tools/planningTools.js';
import { MultiToolCallManager } from '../workflows/chatWorkflowIntegration.js';
import { MultiAgentOrchestrator, type MultiAgentSession } from '../workflows/multiAgentOrchestrator.js';
import type { AgentOutput } from '../agents/baseAgent.js';
import type { HostDecision } from '../agents/hostAgent.js';

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
  mode?: 'single' | 'multi_agent';  // 聊天模式：单agent或多agent
}

// ============= System Prompt =============

/**
 * 生成 System Prompt
 * 动态包含工具定义,防止工具幻觉
 */
function buildSystemPrompt(): string {
  const toolPrompt = generateToolPrompt(); // 从 toolValidator 获取标准化的工具定义
  
  return `⚠️ **重要规则：当需要创建计划、搜索信息等操作时，你必须使用 <tool_call></tool_call> 标签！**

## 🔄 多工具调用能力说明

你现在拥有**多轮工具调用能力**：
- ✅ 可以连续调用多个工具来完成复杂任务
- ✅ 每次调用一个工具后，系统会将结果反馈给你，你可以根据结果决定是否调用下一个工具
- ✅ 最多支持 5 轮工具调用（足够完成大多数任务）
- ✅ 如果工具调用出错，你会收到详细的错误提示，可以修正后重试

例如：用户说"搜索 IELTS 备考方法，然后制定学习计划"
- 第1轮：调用 search_web 搜索
- 等待搜索结果
- 第2轮：根据搜索结果调用 create_plan
- 完成任务！

---

你是一位专业的兴趣教练，擅长帮助用户发现、培养和深化他们的兴趣爱好。你的目标是：

1. 通过提问了解用户的兴趣倾向和个性特点
2. 提供个性化的兴趣建议和培养方案
3. 分享相关的资源和学习路径
4. 鼓励用户坚持并享受兴趣带来的乐趣
5. 使用工具来搜索信息、创建和管理学习计划

## 🔧 工具调用规则 - 必须遵守！

**当需要使用工具时，你必须：**

1. ✅ **必须使用 <tool_call> 和 </tool_call> 标签包裹 JSON**
2. ✅ **JSON 可以格式化，但必须是合法的 JSON 格式**
3. ✅ **立即输出工具调用，不要先说明**

**✅ 正确示例（必须这样做）：**

用户："帮我制定IELTS备考计划"

你的回复：
<tool_call>{"tool": "create_plan", "title": "3个月IELTS备考", "goal": "达到7分", "tasks": [{"title": "模考", "estimated_hours": 3, "deadline": "2025-01-05", "tags": ["mock"]}]}</tool_call>

（等待工具执行后再说明）

**错误示例（不要这样做）：**

❌ 错误1: 没有使用 <tool_call> 标签
我会帮您制定计划：
{
  "tool": "create_plan",
  ...
}

❌ 错误2: 先说明后调用
我会帮您创建计划。
<tool_call>...</tool_call>

❌ 错误3: 只有开始标签没有结束标签
<tool_call>{"tool": "create_plan", ...}

## 🔄 多步骤工具调用 - 非常重要！

**当用户的请求需要多个步骤时，你必须逐步完成所有步骤：**

**场景1: 搜索 + 创建计划**
用户："搜索......，然后帮我制定......计划"

正确流程：
1️⃣ 第一步：调用 search_web 搜索
   <tool_call>{"tool": "search_web", "query": "IELTS 备考方法"}</tool_call>
   
2️⃣ 第二步：等待搜索结果返回后，系统会将结果反馈给你
   
3️⃣ 第三步：基于搜索结果，立即调用 create_plan 创建计划
   <tool_call>{"tool": "create_plan", "title": "...", "goal": "...", "tasks": [...]}</tool_call>
   
4️⃣ 第四步：计划创建成功后，再向用户总结

❌ 错误做法：搜索完成后直接总结给用户，忘记创建计划！

**场景2: 列出计划 + 更新计划**
用户："列出我的计划，然后更新第一个计划的目标"

正确流程：
1️⃣ 调用 list_plans 获取计划列表
2️⃣ 等待列表返回
3️⃣ 调用 update_plan 更新第一个计划
4️⃣ 确认更新成功后再回复用户

**记住：如果用户要求"先...再..."、"然后"、"接着"等多步骤操作，你必须完成所有步骤！**

## ⚠️ 工具结果展示规则 - 极其重要！

**关于 list_plans 工具的重要说明：**
- ✅ list_plans 返回的数据**已经包含每个计划的完整 tasks 数组**
- ✅ 每个计划的 tasks 数组包含所有任务的详细信息（标题、工时、截止日期、标签等）
- ✅ **不需要再调用 get_plan 来获取任务详情**
- ✅ 直接将 list_plans 返回的完整数据展示给用户即可

**当你收到工具执行结果（特别是 list_plans）时：**

1. ✅ **直接使用工具返回的完整 JSON 数据**
2. ✅ **保留所有字段，特别是 tasks 数组**
3. ❌ **不要删除或简化任何字段**
4. ❌ **不要自己重新构造 JSON**
5. ❌ **不要认为需要再调用 get_plan 获取详情**

## 可用工具

${toolPrompt}

## 其他错误示例

❌ 错误4: 编造不存在的工具
<tool_call>{"tool": "calculator", "expression": "123+456"}</tool_call>
原因: calculator 工具不存在

❌ 错误5: 参数名错误
<tool_call>{"tool": "search_web", "keyword": "AI新闻"}</tool_call>
原因: 参数名应该是 query 不是 keyword

## 记住：工具调用必须在第一时间！先调用工具，再说明！

请用友好、鼓励的语气与用户交流，用简洁明了的语言回答问题。`;
}

// 缓存生成的 System Prompt
const SYSTEM_PROMPT = buildSystemPrompt();

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
 * 提取工具调用（处理 <tool_call> 标签或纯 JSON）
 */
function extractToolCall(text: string): { toolCall: any; remainingText: string } | null {
  // 优先匹配完整的闭合标签
  const closedTagRegex = /<tool_call>([\s\S]*?)<\/tool_call>/;
  const closedMatch = text.match(closedTagRegex);
  
  if (closedMatch) {
    try {
      const toolCallJson = closedMatch[1].trim();
      console.log('🔧 发现完整的工具调用标签:', toolCallJson);
      const toolCall = JSON.parse(toolCallJson);
      const remainingText = text.replace(closedMatch[0], '').trim();
      return { toolCall, remainingText };
    } catch (error) {
      console.error('❌ 解析完整标签失败:', error);
    }
  }
  
  // 如果没有闭合标签，尝试匹配开放标签
  const openTagRegex = /<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/;
  const openMatch = text.match(openTagRegex);
  
  if (openMatch) {
    try {
      const toolCallJson = openMatch[1].trim();
      console.log('🔧 发现开放的工具调用标签:', toolCallJson);
      const toolCall = JSON.parse(toolCallJson);
      const remainingText = text.replace(openMatch[0], '').trim();
      return { toolCall, remainingText };
    } catch (error) {
      console.error('❌ 解析开放标签失败:', error);
    }
  }
  
  // 如果没有标签，尝试直接匹配 JSON 格式（适配不同模型的输出）
  // 尝试提取完整的 JSON 对象（包含 "tool" 字段）
  const startIndex = text.indexOf('{');
  if (startIndex !== -1 && text.includes('"tool"')) {
    try {
      // 找到完整的 JSON
      let braceCount = 0;
      let jsonEndIndex = -1;
      let inString = false;
      let escapeNext = false;
      
      for (let i = startIndex; i < text.length; i++) {
        const char = text[i];
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        if (char === '"') {
          inString = !inString;
          continue;
        }
        
        if (!inString) {
          if (char === '{') braceCount++;
          if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
              jsonEndIndex = i + 1;
              break;
            }
          }
        }
      }
      
      if (jsonEndIndex !== -1) {
        let toolCallJson = text.substring(startIndex, jsonEndIndex);
        
        // 移除 JSON 注释
        toolCallJson = toolCallJson.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
        
        console.log('🔧 发现纯 JSON 格式的工具调用（前100字符）:', toolCallJson.substring(0, 100) + '...');
        const toolCall = JSON.parse(toolCallJson);
        
        // 验证是否是有效的工具调用（检查是否有 tool 字段）
        if (toolCall.tool) {
          const remainingText = text.substring(0, startIndex) + text.substring(jsonEndIndex);
          console.log(`✅ 成功提取工具调用: ${toolCall.tool}`);
          return { toolCall, remainingText: remainingText.trim() };
        }
      }
    } catch (error) {
      console.error('❌ 解析纯 JSON 失败:', error);
    }
  }
  
  return null;
}

/**
 * 执行工具调用
 * 返回格式化的结果文本和来源链接
 */
async function executeToolCall(toolCall: any, userId: string): Promise<{ resultText: string; sources?: Array<{title: string; url: string}> }> {
  console.log('🔧 开始执行工具调用:', JSON.stringify(toolCall, null, 2));
  
  // ✅ 新增: 验证工具调用
  const validation = validateToolCall(toolCall);
  if (!validation.valid) {
    console.error('❌ 工具调用验证失败:', validation.error);
    const errorMsg = validation.suggestion 
      ? `${validation.error}\n提示: ${validation.suggestion}`
      : validation.error;
    return {
      resultText: `<tool_error>工具调用错误: ${errorMsg}</tool_error>`,
      sources: []
    };
  }
  
  // 使用标准化后的工具调用
  const normalizedToolCall = validation.normalizedToolCall!;
  const { tool, query, options } = normalizedToolCall;
  
  if (tool === 'search_web') {
    console.log(`🔍 执行搜索，查询: "${query}"`);
    try {
      const searchOptions: SearchOptions = {
        maxResults: options?.maxResults || 10,
        searchDepth: options?.searchDepth || 'advanced',
        includeAnswer: true, // 包含 AI 生成的答案摘要
      };
      
      console.log('🔍 搜索选项:', searchOptions);
      const searchResult = await searchWeb(query, searchOptions);
      console.log('✅ 搜索完成，结果数量:', searchResult.results.length);
      
      if (searchResult.results.length === 0) {
        console.warn('⚠️ 搜索返回了 0 条结果');
        return { 
          resultText: `<search_results>\n没有找到相关结果。请尝试不同的搜索词。\n</search_results>`,
          sources: []
        };
      }
      
      const formattedResults = formatSearchResultsForAI(searchResult.results);
      console.log('📝 格式化后的搜索结果长度:', formattedResults.length);
      
      // 如果有 AI 摘要，也包含进去
      let resultText = formattedResults;
      if (searchResult.answer) {
        console.log('📝 Tavily AI 摘要:', searchResult.answer.substring(0, 100) + '...');
        resultText = `AI 摘要：\n${searchResult.answer}\n\n${formattedResults}`;
      }
      
      // 提取来源链接
      const sources = searchResult.results.map(result => ({
        title: result.title,
        url: result.url
      }));
      console.log('🔗 来源链接数量:', sources.length);
      
      return {
        resultText: `<search_results>\n${resultText}\n</search_results>`,
        sources
      };
    } catch (error: any) {
      console.error('❌ 搜索执行失败:', error);
      console.error('❌ 错误详情:', error.stack);
      return { 
        resultText: `<search_error>搜索失败: ${error.message}</search_error>`,
        sources: []
      };
    }
  }
  
  // ==================== 计划管理工具 ====================
  if (tool === 'create_plan' || tool === 'update_plan' || tool === 'get_plan' || tool === 'list_plans') {
    console.log(`📋 执行计划工具: "${tool}"`);
    try {
      const result = await routePlanningTool(tool, userId, normalizedToolCall);
      
      if (result.success) {
        console.log('✅ 计划工具执行成功:', result.message);
        return {
          resultText: `<tool_result>\n${result.message}\n\n详细数据:\n${JSON.stringify(result.data, null, 2)}\n</tool_result>`,
          sources: []
        };
      } else {
        console.error('❌ 计划工具执行失败:', result.error);
        return {
          resultText: `<tool_error>计划工具执行失败: ${result.error}</tool_error>`,
          sources: []
        };
      }
    } catch (error: any) {
      console.error('❌ 计划工具执行异常:', error);
      return {
        resultText: `<tool_error>计划工具执行异常: ${error.message}</tool_error>`,
        sources: []
      };
    }
  }
  
  console.warn('⚠️ 未知的工具:', tool);
  return { 
    resultText: `<tool_error>未知的工具: ${tool}</tool_error>`,
    sources: []
  };
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
  
  // 存储搜索来源链接
  let searchSources: Array<{title: string; url: string}> | undefined;

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
              console.log('✅ 火山引擎流式响应完成');
              console.log('📝 完整响应内容:', accumulatedText);
              
              // ==================== 多工具调用工作流 ====================
              const workflowManager = new MultiToolCallManager(5);  // 最多5轮
              let currentResponse = accumulatedText;
              let continueLoop = true;
              let loopIteration = 0;
              const MAX_LOOP_ITERATIONS = 10;  // 额外的安全保护
              
              // 获取用户的原始问题（用于在工具结果反馈中提醒 AI）
              const originalUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
              
              console.log(`🔄 [Workflow] 开始多工具调用循环，最多 ${MAX_LOOP_ITERATIONS} 次迭代`);
              
              while (continueLoop && loopIteration < MAX_LOOP_ITERATIONS) {
                loopIteration++;
                console.log(`\n🔁 [Workflow] === 循环迭代 ${loopIteration}/${MAX_LOOP_ITERATIONS} ===`);
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
                await writer.write(encoder.encode(`data: ${toolCallNotice}\n\n`));
                
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
                        
                        await writer.write(encoder.encode(`data: ${sseData}\n\n`));
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
                    // continueLoop 保持 true，让循环继续
                  } else {
                    console.log('✅ [Workflow] 新流完成，但没有新内容，结束循环');
                    continueLoop = false;
                  }
                } else {
                  console.warn('⚠️  [Workflow] 新流未正常完成，但保持循环继续');
                  // 不要退出循环，给一次重试机会
                  // continueLoop 保持 true
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
                await writer.write(encoder.encode(`data: ${sseData}\n\n`));
                
                // 保存 AI 回复到数据库
                try {
                  console.log('💾 准备保存消息到数据库，searchSources:', searchSources);
                  await MessageService.addMessage(
                    conversationId,
                    userId,
                    'assistant',
                    content || accumulatedText,
                    thinking || undefined,
                    modelType,
                    searchSources || undefined  // 保存搜索来源链接
                  );
                  await ConversationService.incrementMessageCount(conversationId, userId);
                  console.log('✅ AI message saved to database with sources:', searchSources?.length || 0);
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
  
  // 存储搜索来源链接
  let searchSources: Array<{title: string; url: string}> | undefined;

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
                console.log('✅ 本地模型流式响应完成');
                console.log('📝 完整响应内容:', accumulatedText);
                
                // 检测是否有工具调用
                const toolCallResult = extractToolCall(accumulatedText);
                
                if (toolCallResult) {
                  console.log('🔧 [本地模型] 检测到工具调用:', toolCallResult.toolCall);
                  
                  // 发送工具调用通知
                  const toolCallNotice = JSON.stringify({
                    content: '正在搜索...',
                    toolCall: toolCallResult.toolCall,
                  });
                  await writer.write(encoder.encode(`data: ${toolCallNotice}\n\n`));
                  
                  // 执行工具调用
                  const { resultText: toolResult, sources } = await executeToolCall(toolCallResult.toolCall, userId);
                  console.log('📦 工具执行结果（前200字符）:', toolResult.substring(0, 200) + '...');
                  console.log('🔗 来源链接:', sources?.length || 0, '条');
                  
                  // 保存 sources，稍后随最终答案一起发送
                  searchSources = sources;
                  
                  // 将工具结果添加到消息历史，并明确指示这是搜索结果
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
                    sources: searchSources || undefined,
                  });
                  await writer.write(encoder.encode(`data: ${sseData}\n\n`));
                  
                  // 保存 AI 回复到数据库
                  try {
                    console.log('💾 准备保存消息到数据库，searchSources:', searchSources);
                    await MessageService.addMessage(
                      conversationId,
                      userId,
                      'assistant',
                      content || accumulatedText,
                      thinking || undefined,
                      modelType,
                      searchSources || undefined  // 保存搜索来源链接
                    );
                    await ConversationService.incrementMessageCount(conversationId, userId);
                    console.log('✅ AI message saved to database with sources:', searchSources?.length || 0);
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

/**
 * 处理多Agent协作并转换为SSE流式响应
 */
async function handleMultiAgentMode(
  userQuery: string,
  userId: string,
  conversationId: string
) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // 添加连接状态标志
  let isStreamClosed = false;
  
  // 安全的写入辅助函数
  const safeWrite = async (data: string) => {
    if (isStreamClosed) {
      console.warn('⚠️  [SSE] 流已关闭，跳过写入');
      return false;
    }
    
    try {
      await writer.write(encoder.encode(data));
      return true;
    } catch (error: any) {
      if (error.name === 'AbortError' || error.code === 'ABORT_ERR') {
        console.warn('⚠️  [SSE] 客户端关闭了连接');
        isStreamClosed = true;
        return false;
      }
      throw error;
    }
  };

  // 异步处理多Agent协作
  (async () => {
    try {
      // 首先发送 conversationId
      const initData = JSON.stringify({
        conversationId: conversationId,
        type: 'init',
        mode: 'multi_agent',
      });
      await safeWrite(`data: ${initData}\n\n`);

      // 创建编排器
      const orchestrator = new MultiAgentOrchestrator(
        {
          maxRounds: 5,
          userId,
          conversationId,
        },
        {
          // Agent输出回调
          onAgentOutput: async (output: AgentOutput) => {
            if (isStreamClosed) return;
            
            console.log(`📤 [SSE] 发送Agent输出: ${output.agent_id}`);
            
            const sseData = JSON.stringify({
              type: 'agent_output',
              agent: output.agent_id,
              round: output.round,
              output_type: output.output_type,
              content: output.content,
              metadata: output.metadata,
              timestamp: output.timestamp,
            });
            
            await safeWrite(`data: ${sseData}\n\n`);
          },

          // Host决策回调
          onHostDecision: async (decision: HostDecision, analysis: any) => {
            if (isStreamClosed) return;
            
            console.log(`📤 [SSE] 发送Host决策: ${decision.action}`);
            
            const sseData = JSON.stringify({
              type: 'host_decision',
              action: decision.action,
              reason: decision.reason,
              next_agents: decision.next_agents,
              consensus_level: analysis.consensus_level,
              timestamp: new Date().toISOString(),
            });
            
            await safeWrite(`data: ${sseData}\n\n`);
          },

          // 轮次完成回调
          onRoundComplete: async (round: number) => {
            if (isStreamClosed) return;
            
            console.log(`📤 [SSE] 第 ${round} 轮完成`);
            
            const sseData = JSON.stringify({
              type: 'round_complete',
              round,
              timestamp: new Date().toISOString(),
            });
            
            await safeWrite(`data: ${sseData}\n\n`);
          },

          // 会话完成回调
          onSessionComplete: async (session: MultiAgentSession) => {
            if (isStreamClosed) return;
            
            console.log(`📤 [SSE] 多Agent会话完成`);
            
            // 保存最终报告到数据库
            try {
              const reporterOutput = session.agents.reporter.last_output;
              if (reporterOutput) {
                await MessageService.addMessage(
                  conversationId,
                  userId,
                  'assistant',
                  reporterOutput.content,
                  undefined,
                  'volcano',
                  undefined
                );
                await ConversationService.incrementMessageCount(conversationId, userId);
                console.log('✅ 多Agent最终报告已保存到数据库');
              }
            } catch (dbError) {
              console.error('❌ 保存多Agent报告失败:', dbError);
            }

            const sseData = JSON.stringify({
              type: 'session_complete',
              status: session.status,
              rounds: session.current_round,
              consensus_trend: session.consensus_trend,
              timestamp: new Date().toISOString(),
            });
            
            await safeWrite(`data: ${sseData}\n\n`);
          },
        }
      );

      // 运行多Agent协作
      console.log('🚀 [MultiAgent] 开始运行多Agent协作...');
      await orchestrator.run(userQuery);

      // 发送完成信号
      if (!isStreamClosed) {
        await safeWrite('data: [DONE]\n\n');
        await writer.close();
        console.log('✅ [MultiAgent] 多Agent协作完成，SSE流正常关闭');
      } else {
        console.log('⚠️  [MultiAgent] 多Agent协作完成，但客户端已提前关闭连接');
        try {
          await writer.close();
        } catch (e) {
          // 忽略关闭错误
        }
      }
    } catch (error: any) {
      console.error('❌ [MultiAgent] 多Agent协作失败:', error);
      
      // 如果连接还在，发送错误信息
      if (!isStreamClosed) {
        try {
          const errorData = JSON.stringify({
            type: 'error',
            error: error.message,
            timestamp: new Date().toISOString(),
          });
          
          await safeWrite(`data: ${errorData}\n\n`);
          await safeWrite('data: [DONE]\n\n');
        } catch (writeError) {
          console.error('❌ 发送错误信息失败:', writeError);
        }
      }
      
      // 尝试关闭writer
      try {
        await writer.close();
      } catch (closeError) {
        // 忽略关闭错误
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
    
    const { message, modelType, conversationId: reqConversationId, userId, mode } = data;

    console.log('解析后的 message:', message);
    console.log('解析后的 modelType:', modelType);
    console.log('解析后的 conversationId:', reqConversationId);
    console.log('解析后的 userId:', userId);
    console.log('解析后的 mode:', mode || 'single');

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

    // ==========================================
    // 📌 多Agent模式处理
    // ==========================================
    if (mode === 'multi_agent') {
      console.log('🤖 [MultiAgent] 启动多Agent协作模式...');
      return handleMultiAgentMode(message, userId, conversationId);
    }

    // ==========================================
    // 📌 阶段 1: 使用滑动窗口记忆管理（单Agent模式）
    // ==========================================
    
    // 初始化记忆服务（使用推荐配置）
    const memoryConfig = getRecommendedConfig(modelType);
    const memoryService = new ConversationMemoryService(memoryConfig);
    
    console.log(`🧠 记忆配置: 窗口=${memoryConfig.windowSize}轮, Token限制=${memoryConfig.maxTokens}`);

    // 调用模型
    if (modelType === 'local') {
      console.log('开始调用本地模型...');
      
      // ==========================================
      // 📌 阶段 1: 构建消息历史（带上下文记忆）
      // ==========================================
      /* 
      // ❌ 旧代码（阶段 0 - 无记忆）：
      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message },
      ];
      */
      
      // ✅ 新代码（阶段 1 - 滑动窗口记忆）：
      const messages = await memoryService.getConversationContext(
        conversationId,
        userId,
        message,
        SYSTEM_PROMPT
      );
      
      console.log(`📚 已加载对话上下文，包含 ${messages.length} 条消息`);
      
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

      // ==========================================
      // 📌 阶段 1: 构建消息历史（带上下文记忆）
      // ==========================================
      /* 
      // ❌ 旧代码（阶段 0 - 无记忆）：
      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message },
      ];
      */
      
      // ✅ 新代码（阶段 1 - 滑动窗口记忆）：
      const messages = await memoryService.getConversationContext(
        conversationId,
        userId,
        message,
        SYSTEM_PROMPT
      );
      
      console.log(`📚 已加载对话上下文，包含 ${messages.length} 条消息`);
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

