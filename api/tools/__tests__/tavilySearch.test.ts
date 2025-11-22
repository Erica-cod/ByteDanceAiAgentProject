/**
 * Tavily 搜索工具测试
 * 
 * 运行测试前需要配置 TAVILY_API_KEY
 */

import { searchWeb, quickSearch, deepSearch, formatSearchResultsForAI } from '../tavilySearch';

// 测试配置
const TEST_ENABLED = false; // 设置为 true 来运行测试（需要有效的 API Key）

describe('Tavily Search Tool', () => {
  // 跳过测试如果没有配置 API Key
  const shouldRun = TEST_ENABLED && process.env.TAVILY_API_KEY;

  test('基础搜索', async () => {
    if (!shouldRun) {
      console.log('跳过测试：未配置 TAVILY_API_KEY');
      return;
    }

    const result = await searchWeb('TypeScript 教程', {
      maxResults: 3
    });

    expect(result.results).toBeDefined();
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.length).toBeLessThanOrEqual(3);
    
    const firstResult = result.results[0];
    expect(firstResult.title).toBeDefined();
    expect(firstResult.url).toBeDefined();
    expect(firstResult.content).toBeDefined();
    
    console.log('搜索结果:', result.results[0].title);
  });

  test('快速搜索', async () => {
    if (!shouldRun) {
      console.log('跳过测试：未配置 TAVILY_API_KEY');
      return;
    }

    const results = await quickSearch('React 最新版本');

    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  test('深度搜索', async () => {
    if (!shouldRun) {
      console.log('跳过测试：未配置 TAVILY_API_KEY');
      return;
    }

    const { results, answer } = await deepSearch('机器学习入门');

    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);
    // 深度搜索应该返回 AI 摘要
    expect(answer).toBeDefined();
    
    console.log('AI 摘要:', answer);
  });

  test('格式化搜索结果', async () => {
    if (!shouldRun) {
      console.log('跳过测试：未配置 TAVILY_API_KEY');
      return;
    }

    const results = await quickSearch('Node.js 教程');
    const formatted = formatSearchResultsForAI(results, 500);

    expect(formatted).toContain('搜索结果：');
    expect(formatted.length).toBeLessThanOrEqual(600); // 允许一些余量
    
    console.log('格式化结果长度:', formatted.length);
  });
});

// 手动测试函数（在实际环境中运行）
export async function manualTest() {
  if (!process.env.TAVILY_API_KEY) {
    console.error('❌ 请先配置 TAVILY_API_KEY 环境变量');
    return;
  }

  console.log('开始 Tavily 搜索测试...\n');

  try {
    // 测试 1: 快速搜索
    console.log('1. 快速搜索测试');
    const quickResults = await quickSearch('React 19 新特性');
    console.log(`   找到 ${quickResults.length} 条结果`);
    console.log(`   第一条: ${quickResults[0]?.title}\n`);

    // 测试 2: 基础搜索
    console.log('2. 基础搜索测试');
    const { results } = await searchWeb('TypeScript 5.0 教程', {
      maxResults: 5
    });
    console.log(`   找到 ${results.length} 条结果`);
    console.log(`   前两条:`);
    results.slice(0, 2).forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.title}`);
      console.log(`      ${r.url}\n`);
    });

    // 测试 3: 深度搜索
    console.log('3. 深度搜索测试');
    const { results: deepResults, answer } = await deepSearch('AI Agent 开发最佳实践');
    console.log(`   找到 ${deepResults.length} 条结果`);
    console.log(`   AI 摘要: ${answer?.substring(0, 200)}...\n`);

    // 测试 4: 格式化结果
    console.log('4. 格式化结果测试');
    const formatted = formatSearchResultsForAI(results, 1000);
    console.log(`   格式化文本长度: ${formatted.length} 字符`);
    console.log(`   预览: ${formatted.substring(0, 200)}...\n`);

    console.log('✅ 所有测试通过！');
  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
  }
}

// 如果直接运行此文件，执行手动测试
if (require.main === module) {
  manualTest();
}



