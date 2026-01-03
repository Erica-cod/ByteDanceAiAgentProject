/**
 * 工具系统使用示例
 */

import {
  initializeToolSystem,
  toolRegistry,
  toolExecutor,
  toolOrchestrator,
} from '../index.js';

// ============ 示例 1：初始化并执行单个工具 ============
async function example1_basicUsage() {
  console.log('\n📖 示例 1：基础用法');
  console.log('='.repeat(50));

  // 1. 初始化工具系统
  initializeToolSystem();

  // 2. 执行工具
  const context = {
    userId: 'user123',
    conversationId: 'conv456',
    requestId: 'req789',
    timestamp: Date.now(),
  };

  const result = await toolExecutor.execute(
    'search_web',
    { query: 'AI 最新技术', max_results: 3 },
    context
  );

  console.log('\n执行结果:');
  console.log(JSON.stringify(result, null, 2));
}

// ============ 示例 2：使用 Function Calling（OpenAI 格式） ============
async function example2_functionCalling() {
  console.log('\n📖 示例 2：Function Calling 集成');
  console.log('='.repeat(50));

  initializeToolSystem();

  // 模拟 OpenAI 返回的 Function Calling 响应
  const openaiResponse = {
    choices: [{
      message: {
        tool_calls: [{
          id: 'call_123',
          type: 'function',
          function: {
            name: 'search_web',
            arguments: '{"query": "TypeScript 最佳实践", "max_results": 5, "search_depth": "advanced"}',
          },
        }],
      },
    }],
  };

  const toolCall = openaiResponse.choices[0].message.tool_calls[0];
  const params = JSON.parse(toolCall.function.arguments);

  const context = {
    userId: 'user123',
    requestId: 'req001',
    timestamp: Date.now(),
  };

  const result = await toolExecutor.execute(
    toolCall.function.name,
    params,
    context
  );

  console.log('\n工具调用结果:');
  console.log(`成功: ${result.success}`);
  console.log(`耗时: ${result.duration}ms`);
  console.log(`来自缓存: ${result.fromCache}`);
}

// ============ 示例 3：多步工具编排 ============
async function example3_orchestration() {
  console.log('\n📖 示例 3：多步工具编排');
  console.log('='.repeat(50));

  initializeToolSystem();

  // 定义编排计划：列计划 → 查看第一个计划 → 更新计划
  const plan = {
    planId: 'plan_001',
    createdAt: Date.now(),
    steps: [
      {
        stepId: 'step1',
        toolName: 'list_plans',
        params: { limit: 5 },
        description: '列出所有计划',
        onFailure: 'abort' as const,
      },
      {
        stepId: 'step2',
        toolName: 'get_plan',
        params: {
          plan_id: '${step1.data.plans.0.plan_id}', // 引用第一个计划的 ID
        },
        dependsOn: ['step1'],
        description: '查看第一个计划的详情',
        onFailure: 'continue' as const,
      },
      {
        stepId: 'step3',
        toolName: 'update_plan',
        params: {
          plan_id: '${step2.data.plan_id}',
          title: '更新后的计划标题',
        },
        dependsOn: ['step2'],
        description: '更新计划标题',
        onFailure: 'abort' as const,
      },
    ],
  };

  const context = {
    userId: 'user123',
    requestId: 'req002',
    timestamp: Date.now(),
  };

  const result = await toolOrchestrator.executePlan(plan, context);

  console.log('\n编排结果:');
  console.log(`总体成功: ${result.success}`);
  console.log(`总耗时: ${result.totalDuration}ms`);
  console.log(`步骤数: ${Object.keys(result.stepResults).length}`);
  
  Object.entries(result.stepResults).forEach(([stepId, stepResult]) => {
    console.log(`\n${stepId}:`);
    console.log(`  成功: ${stepResult.success}`);
    console.log(`  消息: ${stepResult.message}`);
  });
}

// ============ 示例 4：获取工具状态和指标 ============
async function example4_monitoring() {
  console.log('\n📖 示例 4：监控和指标');
  console.log('='.repeat(50));

  initializeToolSystem();

  // 执行几次工具调用生成数据
  const context = {
    userId: 'user123',
    requestId: 'req003',
    timestamp: Date.now(),
  };

  for (let i = 0; i < 3; i++) {
    await toolExecutor.execute(
      'search_web',
      { query: `测试查询 ${i}`, max_results: 3 },
      context
    );
  }

  // 获取所有工具的指标
  const metrics = toolExecutor.getAllMetrics();

  console.log('\n📊 工具指标:');
  metrics.forEach(metric => {
    console.log(`\n${metric.name}:`);
    console.log(`  状态: ${metric.status}`);
    console.log(`  总调用: ${metric.totalCalls}`);
    console.log(`  成功率: ${(metric.successCalls / metric.totalCalls * 100).toFixed(1)}%`);
    console.log(`  平均延迟: ${metric.averageLatency}ms`);
    console.log(`  缓存命中率: ${metric.cacheHitRate}`);
    console.log(`  并发: ${metric.concurrent}`);
    console.log(`  熔断器: ${metric.circuitBreakerState}`);
  });
}

// ============ 示例 5：自定义插件 ============
async function example5_customPlugin() {
  console.log('\n📖 示例 5：自定义插件');
  console.log('='.repeat(50));

  // 定义自定义插件
  const customPlugin = {
    metadata: {
      name: 'get_current_time',
      description: '获取当前时间',
      version: '1.0.0',
      author: 'Example',
      enabled: true,
    },
    schema: {
      name: 'get_current_time',
      description: '获取当前时间（本地或指定时区）',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: '时区（如 Asia/Shanghai）',
            default: 'local',
          },
        },
      },
    },
    rateLimit: {
      maxConcurrent: 1000,
      maxPerMinute: 10000,
      timeout: 100,
    },
    cache: {
      enabled: false,
      ttl: 0,
    },
    execute: async (params: any) => {
      const now = new Date();
      const timezone = params.timezone || 'local';
      
      return {
        success: true,
        data: {
          timestamp: now.getTime(),
          iso: now.toISOString(),
          timezone,
        },
        message: `当前时间: ${now.toLocaleString()}`,
      };
    },
  };

  initializeToolSystem();
  
  // 注册自定义插件
  toolRegistry.register(customPlugin);

  // 使用自定义插件
  const context = {
    userId: 'user123',
    requestId: 'req004',
    timestamp: Date.now(),
  };

  const result = await toolExecutor.execute(
    'get_current_time',
    { timezone: 'Asia/Shanghai' },
    context
  );

  console.log('\n自定义工具执行结果:');
  console.log(JSON.stringify(result, null, 2));
}

// ============ 运行所有示例 ============
async function runAllExamples() {
  await example1_basicUsage();
  await example2_functionCalling();
  await example3_orchestration();
  await example4_monitoring();
  await example5_customPlugin();
}

// 导出供使用
export {
  example1_basicUsage,
  example2_functionCalling,
  example3_orchestration,
  example4_monitoring,
  example5_customPlugin,
  runAllExamples,
};

