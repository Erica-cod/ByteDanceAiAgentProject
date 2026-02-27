/**
 * 网络搜索工具插件
 * 
 * 功能：使用 Tavily API 搜索互联网
 */

import { searchWeb } from '../../tavilySearch.js';
import type { ToolPlugin } from '../core/types.js';
import crypto from 'crypto';

function normalizeQuery(q: string) {
  // 缓存命中率提升的关键在于“查询归一化”
  // - 去首尾空白
  // - 多空白折叠
  return q.trim().replace(/\s+/g, ' ');
}

export const searchWebPlugin: ToolPlugin = {
  // ============ 元数据 ============
  metadata: {
    name: 'search_web',
    description: '搜索互联网获取最新信息',
    version: '1.0.0',
    author: 'AI Agent Team',
    tags: ['search', 'external-api', 'realtime'],
    enabled: true,
  },

  // ============ Function Calling Schema ============
  schema: {
    name: 'search_web',
    description: '搜索互联网获取实时信息、新闻、事实核查。适用于需要最新数据的场景。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索查询关键词或问题',
        },
        max_results: {
          type: 'number',
          description: '返回的最大结果数（1-10）',
          default: 5,
        },
        search_depth: {
          type: 'string',
          enum: ['basic', 'advanced'],
          description: '搜索深度：basic（快速，适合简单查询）或 advanced（详细，适合复杂主题）',
          default: 'basic',
        },
      },
      required: ['query'],
    },
  },

  // ============ 限流配置 ============
  rateLimit: {
    maxConcurrent: 50,      // 最多50个并发搜索
    maxPerMinute: 100,      // 每分钟最多100次搜索
    timeout: 10000,         // 超时10秒
  },

  // ============ 缓存配置 ============
  cache: {
    enabled: true,
    ttl: 300,              // 缓存5分钟（搜索结果时效性）
    //  注意：ToolExecutor 的缓存检查发生在 validate 之前，所以“归一化”必须放到 keyGenerator 里
    keyStrategy: 'custom',
    keyGenerator: (params) => {
      const q = normalizeQuery(String(params?.query || ''));
      const max_results = Number(params?.max_results ?? 5);
      const search_depth = String(params?.search_depth ?? 'basic');
      const keyPayload = JSON.stringify({ q, max_results, search_depth });
      const hash = crypto.createHash('md5').update(keyPayload).digest('hex');
      return `v1:${hash}`;
    },
  },

  // ============ 熔断器配置 ============
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,   // 连续失败5次触发熔断
    resetTimeout: 60000,   // 熔断后60秒尝试恢复
    halfOpenRequests: 2,   // 半开状态下允许2个测试请求
  },

  // ============ 重试配置 ============
  retry: {
    enabled: true,
    maxAttempts: 2,        // 最多重试2次
    delay: 1000,           // 重试间隔1秒
    strategy: 'exponential',
    retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'],
  },

  // ============ 降级配置（参考 Netflix Hystrix） ============
  fallback: {
    enabled: true,
    fallbackChain: [
      // 1. 先尝试返回正常缓存
      { type: 'cache' },
      
      // 2. 尝试返回过期缓存（即使过期也比没有好）
      { type: 'stale-cache' },
      
      // 3. 简化搜索（只返回 3 条结果，使用快速模式）
      { type: 'simplified' },
      
      // 4. 返回默认提示（兜底）
      { type: 'default' },
    ],
    
    // 简化参数（降级时使用）
    simplifiedParams: {
      max_results: 3,           // 降级时只返回 3 条
      search_depth: 'basic',    // 使用快速搜索
    },
    
    // 默认响应（所有策略失败时的兜底）
    defaultResponse: {
      success: true,
      data: {
        results: [],
        count: 0,
        message: '搜索服务暂时不可用，请稍后重试',
      },
      message: '搜索服务暂时不可用，请稍后重试',
    },
    
    // 降级策略超时（3秒快速失败）
    fallbackTimeout: 3000,
    
    // 允许返回过期缓存
    allowStaleCache: true,
  },

  // ============ 参数验证 ============
  validate: async (params) => {
    const errors: string[] = [];

    // 验证 query
    if (!params.query || typeof params.query !== 'string') {
      errors.push('query 必须是非空字符串');
    } else if (params.query.length < 2) {
      errors.push('query 至少需要2个字符');
    } else if (params.query.length > 500) {
      errors.push('query 不能超过500个字符');
    }

    // 验证 max_results
    if (params.max_results !== undefined) {
      if (typeof params.max_results !== 'number') {
        errors.push('max_results 必须是数字');
      } else if (params.max_results < 1 || params.max_results > 10) {
        errors.push('max_results 必须在 1-10 之间');
      }
    }

    // 验证 search_depth
    if (params.search_depth !== undefined) {
      if (!['basic', 'advanced'].includes(params.search_depth)) {
        errors.push('search_depth 必须是 "basic" 或 "advanced"');
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  },

  // ============ 执行函数 ============
  execute: async (params, context) => {
    const {
      query,
      max_results = 5,
      search_depth = 'basic',
    } = params;

    console.log(`🔍 [SearchWeb] 执行搜索`);
    console.log(`   查询: "${query}"`);
    console.log(`   结果数: ${max_results}`);
    console.log(`   深度: ${search_depth}`);
    console.log(`   用户: ${context.userId}`);

    try {
      const result = await searchWeb(query, {
        maxResults: max_results,
        searchDepth: search_depth,
        includeAnswer: true,
      });

      if (result.results.length === 0) {
        console.warn(`   ⚠️  未找到搜索结果`);
        return {
          success: true,
          data: {
            results: [],
            count: 0,
          },
          message: '未找到相关结果，请尝试不同的关键词',
        };
      }

      // 格式化搜索结果
      const formattedResults = result.results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.content}\n   来源: ${r.url}`)
        .join('\n\n');

      // 提取来源链接
      const sources = result.results.map(r => ({
        title: r.title,
        url: r.url,
      }));

      console.log(`   ✅ 找到 ${result.results.length} 条结果`);

      return {
        success: true,
        data: {
          answer: result.answer,
          results: formattedResults,
          count: result.results.length,
        },
        sources,
        message: `找到 ${result.results.length} 条搜索结果`,
      };
    } catch (error: any) {
      console.error(`   ❌ 搜索失败:`, error);

      return {
        success: false,
        error: error.message || '搜索失败',
      };
    }
  },

  // ============ 初始化钩子 ============
  onInit: async () => {
    console.log('🔍 [SearchWeb] 插件已初始化');
    
    // 检查 API Key
    if (!process.env.TAVILY_API_KEY) {
      console.warn('   ⚠️  TAVILY_API_KEY 未配置，搜索功能可能不可用');
    }
  },

  // ============ 销毁钩子 ============
  onDestroy: async () => {
    console.log('🔍 [SearchWeb] 插件已销毁');
    // 清理资源（如果有）
  },
};

