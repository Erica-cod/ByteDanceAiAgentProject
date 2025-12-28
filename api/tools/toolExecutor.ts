/**
 * 工具执行器
 * 统一处理各种工具的执行逻辑
 */

import { validateToolCall } from './toolValidator.js';
import { searchWeb, formatSearchResultsForAI, type SearchOptions } from './tavilySearch.js';
import { routePlanningTool } from './planningTools.js';

/**
 * 工具执行结果
 */
export interface ToolExecutionResult {
  resultText: string;
  sources?: Array<{ title: string; url: string }>;
}

/**
 * 执行工具调用
 * 返回格式化的结果文本和来源链接
 */
export async function executeToolCall(toolCall: any, userId: string): Promise<ToolExecutionResult> {
  console.log('🔧 开始执行工具调用:', JSON.stringify(toolCall, null, 2));
  
  // ✅ 验证工具调用
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
  
  // ==================== 搜索工具 ====================
  if (tool === 'search_web') {
    console.log(`🔍 执行搜索，查询: "${query}"`);
    try {
      const searchOptions: SearchOptions = {
        maxResults: options?.maxResults || 10,
        searchDepth: options?.searchDepth || 'advanced',
        includeAnswer: true,
      };
      
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
      
      // 如果有 AI 摘要，也包含进去
      let resultText = formattedResults;
      if (searchResult.answer) {
        resultText = `AI 摘要：\n${searchResult.answer}\n\n${formattedResults}`;
      }
      
      // 提取来源链接
      const sources = searchResult.results.map(result => ({
        title: result.title,
        url: result.url
      }));
      
      return {
        resultText: `<search_results>\n${resultText}\n</search_results>`,
        sources
      };
    } catch (error: any) {
      console.error('❌ 搜索执行失败:', error);
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

