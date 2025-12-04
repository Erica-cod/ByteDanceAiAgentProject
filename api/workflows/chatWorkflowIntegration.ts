/**
 * Chat.ts 工作流集成
 * 
 * 提供简单的接口供 chat.ts 使用，实现多轮工具调用
 */

import { validateToolCall } from '../tools/toolValidator.js';
import { searchWeb, formatSearchResultsForAI, type SearchOptions } from '../tools/tavilySearch.js';
import { routePlanningTool } from '../tools/planningTools.js';

/**
 * 工具调用历史
 */
export interface ToolCallRecord {
  tool: string;
  params: any;
  result: any;
  success: boolean;
  timestamp: Date;
}

/**
 * 工作流执行结果
 */
export interface WorkflowResult {
  hasToolCall: boolean;
  toolCall?: any;
  toolResult?: {
    resultText: string;
    sources?: Array<{ title: string; url: string }>;
  };
  shouldContinue: boolean;
  error?: string;
}

/**
 * 提取工具调用
 */
function extractToolCall(text: string): any | null {
  try {
    console.log(`🔍 [extractToolCall] 开始提取工具调用...`);
    console.log(`📝 [extractToolCall] 文本长度: ${text.length} 字符`);
    
    // 1. 匹配 <tool_call> 标签
    const tagRegex = /<tool_call>([\s\S]*?)<\/tool_call>/;
    const tagMatch = text.match(tagRegex);
    
    if (tagMatch) {
      console.log(`✅ [extractToolCall] 找到 <tool_call> 标签`);
      let jsonStr = tagMatch[1].trim();
      console.log(`📝 [extractToolCall] 原始内容长度: ${jsonStr.length} 字符`);
      console.log(`📝 [extractToolCall] JSON 内容（前200字符）: ${jsonStr.substring(0, 200)}...`);
      console.log(`📝 [extractToolCall] JSON 内容（后200字符）: ...${jsonStr.substring(Math.max(0, jsonStr.length - 200))}`);
      
      // 🔧 新增：先尝试提取第一个完整的JSON对象，忽略后面可能的垃圾字符
      const firstBraceIndex = jsonStr.indexOf('{');
      if (firstBraceIndex !== -1) {
        let braceCount = 0;
        let inString = false;
        let escapeNext = false;
        let jsonEndIndex = -1;
        
        for (let i = firstBraceIndex; i < jsonStr.length; i++) {
          const char = jsonStr[i];
          
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          
          if (char === '\\') {
            escapeNext = true;
            continue;
          }
          
          if (char === '"' && !inString) {
            inString = true;
            continue;
          } else if (char === '"' && inString) {
            inString = false;
            continue;
          }
          
          if (!inString) {
            if (char === '{') braceCount++;
            if (char === '}') {
              braceCount--;
              if (braceCount === 0) {
                jsonEndIndex = i + 1;
                console.log(`🔍 [extractToolCall] 找到JSON结束位置: ${jsonEndIndex}/${jsonStr.length}`);
                break;
              }
            }
          }
        }
        
        if (jsonEndIndex !== -1 && jsonEndIndex < jsonStr.length) {
          const cleanJsonStr = jsonStr.substring(firstBraceIndex, jsonEndIndex);
          const garbage = jsonStr.substring(jsonEndIndex);
          if (garbage.trim()) {
            console.warn(`⚠️  [extractToolCall] 检测到JSON后有垃圾字符: "${garbage}"`);
            console.log(`🔧 [extractToolCall] 已自动移除垃圾，使用干净的JSON`);
          }
          jsonStr = cleanJsonStr;
        }
      }
      
      try {
        const parsed = JSON.parse(jsonStr);
        console.log(`✅ [extractToolCall] JSON 解析成功，工具: ${parsed.tool}`);
        return parsed;
      } catch (parseError: any) {
        console.error(`❌ [extractToolCall] 第一次 JSON 解析失败:`, parseError.message);
        
        // 尝试修复常见的 JSON 错误
        console.log(`🔧 [extractToolCall] 尝试修复 JSON...`);
        
        // 1. 移除尾部的逗号（常见错误）
        jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
        
        // 2. 确保字符串中的引号正确转义
        // 3. 移除可能的注释
        jsonStr = jsonStr.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
        
        // 4. 检查是否缺少结束括号
        const openBraces = (jsonStr.match(/{/g) || []).length;
        const closeBraces = (jsonStr.match(/}/g) || []).length;
        const openBrackets = (jsonStr.match(/\[/g) || []).length;
        const closeBrackets = (jsonStr.match(/\]/g) || []).length;
        
        console.log(`🔍 [extractToolCall] 括号统计: { ${openBraces} vs } ${closeBraces}, [ ${openBrackets} vs ] ${closeBrackets}`);
        
        // 如果缺少结束括号，尝试补全
        if (openBrackets > closeBrackets) {
          const missing = openBrackets - closeBrackets;
          console.log(`🔧 [extractToolCall] 补全 ${missing} 个 ]`);
          jsonStr += ']'.repeat(missing);
        }
        if (openBraces > closeBraces) {
          const missing = openBraces - closeBraces;
          console.log(`🔧 [extractToolCall] 补全 ${missing} 个 }`);
          jsonStr += '}'.repeat(missing);
        }
        
        try {
          const parsed = JSON.parse(jsonStr);
          console.log(`✅ [extractToolCall] 修复后 JSON 解析成功，工具: ${parsed.tool}`);
          return parsed;
        } catch (secondError: any) {
          console.error(`❌ [extractToolCall] 修复后仍然解析失败:`, secondError.message);
          console.error(`📝 [extractToolCall] 修复后的 JSON（前1000字符）:\n${jsonStr.substring(0, 1000)}`);
          console.error(`📝 [extractToolCall] 修复后的 JSON（后500字符）:\n...${jsonStr.substring(Math.max(0, jsonStr.length - 500))}`);
          return null;
        }
      }
    }
    
    console.log(`⚠️  [extractToolCall] 未找到 <tool_call> 标签，尝试提取纯 JSON...`);
    
    // 2. 匹配纯 JSON
    const startIndex = text.indexOf('{');
    if (startIndex !== -1 && text.includes('"tool"')) {
      console.log(`🔍 [extractToolCall] 找到 JSON 起始位置: ${startIndex}`);
      
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
        console.log(`✅ [extractToolCall] 找到 JSON 结束位置: ${jsonEndIndex}`);
        let jsonStr = text.substring(startIndex, jsonEndIndex);
        jsonStr = jsonStr.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
        console.log(`📝 [extractToolCall] 提取的 JSON（前200字符）: ${jsonStr.substring(0, 200)}...`);
        
        try {
          const parsed = JSON.parse(jsonStr);
          console.log(`✅ [extractToolCall] JSON 解析成功，工具: ${parsed.tool}`);
          return parsed;
        } catch (parseError: any) {
          console.error(`❌ [extractToolCall] JSON 解析失败:`, parseError.message);
          console.error(`📝 [extractToolCall] 完整 JSON:\n${jsonStr}`);
          return null;
        }
      } else {
        console.warn(`⚠️  [extractToolCall] 未找到 JSON 结束位置，braceCount: ${braceCount}`);
      }
    } else {
      console.warn(`⚠️  [extractToolCall] 未找到 JSON 起始标记或 "tool" 字段`);
    }
    
    console.log(`❌ [extractToolCall] 未能提取工具调用`);
    return null;
  } catch (error: any) {
    console.error(`❌ [extractToolCall] 异常:`, error.message);
    console.error(`📝 [extractToolCall] 文本内容（前500字符）:\n${text.substring(0, 500)}`);
    return null;
  }
}

/**
 * 处理单次工具调用
 * 
 * @param aiResponse - AI 的完整回复文本
 * @param userId - 用户ID
 * @param currentIteration - 当前迭代次数
 * @returns 工具执行结果
 */
export async function processSingleToolCall(
  aiResponse: string,
  userId: string,
  currentIteration: number = 0
): Promise<WorkflowResult> {
  
  console.log(`\n🔍 [Workflow] 处理 AI 回复，迭代: ${currentIteration}/5`);
  
  // 检查最大迭代次数
  if (currentIteration >= 5) {
    console.log('⚠️  [Workflow] 达到最大迭代次数');
    return {
      hasToolCall: false,
      shouldContinue: false,
    };
  }
  
  // 提取工具调用
  console.log(`📝 [Workflow] AI回复长度: ${aiResponse.length} 字符`);
  console.log(`📝 [Workflow] AI回复开头（前300字符）:\n${aiResponse.substring(0, 300)}`);
  
  const toolCall = extractToolCall(aiResponse);
  
  if (!toolCall) {
    console.warn('⚠️  [Workflow] 没有检测到工具调用');
    console.warn(`📝 [Workflow] AI完整回复:\n${aiResponse}`);
    
    // 额外检查：是否包含 tool_call 标签但解析失败
    if (aiResponse.includes('<tool_call>')) {
      console.error('❌ [Workflow] 检测到 <tool_call> 标签，但提取失败！可能是 JSON 格式问题');
    }
    
    return {
      hasToolCall: false,
      shouldContinue: false,
    };
  }
  
  console.log(`🔧 [Workflow] 检测到工具: ${toolCall.tool}`);
  
  try {
    // 验证工具调用
    const validation = validateToolCall(toolCall);
    
    if (!validation.valid) {
      console.error('❌ [Workflow] 工具验证失败:', validation.error);
      
      // 构建详细的错误反馈，帮助 AI 修正
      let errorFeedback = `⚠️ 工具调用错误\n\n`;
      errorFeedback += `你的工具调用：\n\`\`\`json\n${JSON.stringify(toolCall, null, 2)}\n\`\`\`\n\n`;
      errorFeedback += `错误原因：${validation.error}\n\n`;
      
      if (validation.suggestion) {
        errorFeedback += `💡 修正建议：${validation.suggestion}\n\n`;
      }
      
      errorFeedback += `请立即重新生成正确的工具调用。参考正确格式并重试。`;
      
      return {
        hasToolCall: true,
        toolCall,
        toolResult: {
          resultText: errorFeedback,
          sources: [],
        },
        shouldContinue: true, // ✅ 给 AI 一次重试机会
        error: validation.error,
      };
    }
    
    const normalizedToolCall = validation.normalizedToolCall!;
    const { tool } = normalizedToolCall;
    
    // 执行工具
    let resultText = '';
    let sources: Array<{ title: string; url: string }> = [];
    
    if (tool === 'search_web') {
      console.log(`🔍 [Workflow] 执行搜索...`);
      
      const searchResult = await searchWeb(normalizedToolCall.query, {
        maxResults: normalizedToolCall.maxResults || 10,
        searchDepth: normalizedToolCall.searchDepth || 'advanced',
        includeAnswer: true,
      });
      
      const formattedResults = formatSearchResultsForAI(searchResult.results);
      
      resultText = `<search_results>\n`;
      if (searchResult.answer) {
        resultText += `AI 摘要：\n${searchResult.answer}\n\n`;
      }
      resultText += `${formattedResults}\n</search_results>`;
      
      sources = searchResult.results.map(r => ({ title: r.title, url: r.url }));
      
      console.log(`✅ [Workflow] 搜索完成，找到 ${searchResult.results.length} 条结果`);
    }
    else if (['create_plan', 'update_plan', 'get_plan', 'list_plans'].includes(tool)) {
      console.log(`📋 [Workflow] 执行计划工具: ${tool}`);
      
      const result = await routePlanningTool(tool, userId, normalizedToolCall);
      
      if (result.success) {
        resultText = `<tool_result>\n${result.message}\n\n详细数据:\n${JSON.stringify(result.data, null, 2)}\n</tool_result>`;
        console.log(`✅ [Workflow] 计划工具执行成功`);
      } else {
        resultText = `<tool_error>计划工具执行失败: ${result.error}</tool_error>`;
        console.error(`❌ [Workflow] 计划工具执行失败`);
      }
    }
    else {
      resultText = `<tool_error>未知的工具: ${tool}</tool_error>`;
      console.warn(`⚠️  [Workflow] 未知工具: ${tool}`);
    }
    
    return {
      hasToolCall: true,
      toolCall: normalizedToolCall,
      toolResult: {
        resultText,
        sources,
      },
      shouldContinue: true,  // 工具执行成功，可以继续
    };
    
  } catch (error: any) {
    console.error('❌ [Workflow] 工具执行异常:', error.message);
    
    return {
      hasToolCall: true,
      toolCall,
      toolResult: {
        resultText: `<tool_error>工具执行异常: ${error.message}</tool_error>`,
        sources: [],
      },
      shouldContinue: false,
      error: error.message,
    };
  }
}

/**
 * 多工具调用管理器
 * 
 * 管理多轮工具调用的状态
 */
export class MultiToolCallManager {
  private history: ToolCallRecord[] = [];
  private maxIterations = 5;
  private currentIteration = 0;
  private consecutiveErrors = 0; // 连续错误计数
  private maxConsecutiveErrors = 2; // 最多允许连续2次错误
  
  constructor(maxIterations: number = 5) {
    this.maxIterations = maxIterations;
  }
  
  /**
   * 处理 AI 回复并执行工具
   */
  async processAIResponse(
    aiResponse: string,
    userId: string
  ): Promise<WorkflowResult> {
    
    const result = await processSingleToolCall(
      aiResponse,
      userId,
      this.currentIteration
    );
    
    // 记录工具调用
    if (result.hasToolCall && result.toolCall) {
      this.history.push({
        tool: result.toolCall.tool,
        params: result.toolCall,
        result: result.toolResult,
        success: !result.error,
        timestamp: new Date(),
      });
      
      this.currentIteration++;
      
      // 更新错误计数器
      if (result.error) {
        this.consecutiveErrors++;
        console.warn(`⚠️  [Workflow] 连续错误次数: ${this.consecutiveErrors}/${this.maxConsecutiveErrors}`);
        
        // 如果连续错误超过限制，强制停止
        if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
          console.error('❌ [Workflow] 连续错误次数过多，终止工作流');
          return {
            ...result,
            shouldContinue: false,
          };
        }
      } else {
        // 成功则重置错误计数
        this.consecutiveErrors = 0;
      }
    }
    
    return result;
  }
  
  /**
   * 获取工具调用历史
   */
  getHistory(): ToolCallRecord[] {
    return this.history;
  }
  
  /**
   * 获取历史摘要
   */
  getHistorySummary(): string {
    if (this.history.length === 0) {
      return '无工具调用';
    }
    
    return this.history
      .map((record, index) => {
        const status = record.success ? '✅' : '❌';
        return `${index + 1}. ${status} ${record.tool}`;
      })
      .join(', ');
  }
  
  /**
   * 重置状态
   */
  reset(): void {
    this.history = [];
    this.currentIteration = 0;
  }
}

