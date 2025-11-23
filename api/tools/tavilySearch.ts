/**
 * Tavily 搜索工具 - 为 AI Agent 提供联网搜索能力
 * 
 * 功能：
 * - 联网实时搜索
 * - 获取高质量搜索结果
 * - 支持深度搜索模式
 */

import { tavily } from '@tavily/core';

// 初始化 Tavily 客户端
const tavilyApiKey = process.env.TAVILY_API_KEY;

if (!tavilyApiKey) {
  console.warn('⚠️  TAVILY_API_KEY 未配置，搜索功能将不可用');
}

const tavilyClient = tavilyApiKey ? tavily({ apiKey: tavilyApiKey }) : null;

/**
 * 搜索结果接口
 */
export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

/**
 * 搜索选项
 */
export interface SearchOptions {
  maxResults?: number;        // 最大结果数量，默认 5
  searchDepth?: 'basic' | 'advanced';  // 搜索深度，默认 basic
  includeAnswer?: boolean;    // 是否包含 AI 生成的答案摘要，默认 false
  includeRawContent?: false | 'text' | 'markdown'; // 是否包含原始内容，默认 false
}

/**
 * 执行网络搜索
 * 
 * @param query - 搜索查询
 * @param options - 搜索选项
 * @returns 搜索结果
 */
export async function searchWeb(
  query: string,
  options: SearchOptions = {}
): Promise<{
  results: SearchResult[];
  answer?: string;
  query: string;
}> {
  if (!tavilyClient) {
    throw new Error('Tavily API Key 未配置，无法执行搜索');
  }

  const {
    maxResults = 5,
    searchDepth = 'basic',
    includeAnswer = false,
    includeRawContent = false,
  } = options;

  try {
    console.log(`🔍 开始搜索: "${query}"`);
    
    const response = await tavilyClient.search(query, {
      maxResults,
      searchDepth,
      includeAnswer,
      includeRawContent,
    });

    const results: SearchResult[] = response.results.map((result: any) => ({
      title: result.title,
      url: result.url,
      content: result.content,
      score: result.score,
    }));

    console.log(`✅ 搜索完成，找到 ${results.length} 条结果`);

    return {
      results,
      answer: response.answer,
      query: response.query,
    };
  } catch (error: any) {
    console.error('❌ Tavily 搜索失败:', error);
    throw new Error(`搜索失败: ${error.message}`);
  }
}

/**
 * 快速搜索（只返回前3条结果，用于快速查询）
 * 
 * @param query - 搜索查询
 * @returns 搜索结果
 */
export async function quickSearch(query: string): Promise<SearchResult[]> {
  const { results } = await searchWeb(query, {
    maxResults: 3,
    searchDepth: 'basic',
  });
  return results;
}

/**
 * 深度搜索（返回更多结果和 AI 摘要）
 * 
 * @param query - 搜索查询
 * @returns 搜索结果和 AI 摘要
 */
export async function deepSearch(query: string): Promise<{
  results: SearchResult[];
  answer?: string;
}> {
  const { results, answer } = await searchWeb(query, {
    maxResults: 10,
    searchDepth: 'advanced',
    includeAnswer: true,
  });
  return { results, answer };
}

/**
 * 格式化搜索结果为文本（供 AI 使用）
 * 
 * @param results - 搜索结果
 * @param maxLength - 最大长度（字符数），默认 8000
 * @returns 格式化的文本
 */
export function formatSearchResultsForAI(
  results: SearchResult[],
  maxLength: number = 8000
): string {
  let formatted = '搜索结果：\n\n';
  let currentLength = formatted.length;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const entry = `${i + 1}. ${result.title}\n来源：${result.url}\n内容：${result.content}\n\n`;
    
    if (currentLength + entry.length > maxLength) {
      formatted += `\n（结果已截断，共 ${results.length} 条结果）`;
      break;
    }
    
    formatted += entry;
    currentLength += entry.length;
  }

  return formatted;
}

