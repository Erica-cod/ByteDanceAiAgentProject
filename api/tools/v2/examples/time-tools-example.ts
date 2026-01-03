/**
 * 时间工具使用示例
 * 
 * 展示如何在实际场景中使用时间工具插件
 */

import { toolExecutor } from '../core/tool-executor.js';
import { initializeToolSystem } from '../index.js';

// 初始化工具系统
initializeToolSystem();

// 模拟上下文
const context = {
  userId: 'user_123',
  requestId: `req_${Date.now()}`,
  timestamp: Date.now(),
};

/**
 * 示例 1：获取当前时间
 */
async function example1_getCurrentTime() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 1: 获取当前时间');
  console.log('='.repeat(50));

  const result = await toolExecutor.execute(
    'get_current_time',
    {
      timezone: 'Asia/Shanghai',
      format: 'both',
    },
    context
  );

  console.log('执行结果:', JSON.stringify(result, null, 2));
}

/**
 * 示例 2：计算日期 - 3天后
 */
async function example2_calculateFutureDate() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 2: 计算 3 天后的日期');
  console.log('='.repeat(50));

  const result = await toolExecutor.execute(
    'calculate_date',
    {
      days: 3,
    },
    context
  );

  console.log('执行结果:', JSON.stringify(result, null, 2));
}

/**
 * 示例 3：计算日期 - 从指定日期往前推2周
 */
async function example3_calculatePastDate() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 3: 从 2025-12-25 往前推 2 周');
  console.log('='.repeat(50));

  const result = await toolExecutor.execute(
    'calculate_date',
    {
      base_date: '2025-12-25',
      weeks: -2,
    },
    context
  );

  console.log('执行结果:', JSON.stringify(result, null, 2));
}

/**
 * 示例 4：计算工作日
 */
async function example4_calculateWorkdays() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 4: 5 个工作日后');
  console.log('='.repeat(50));

  const result = await toolExecutor.execute(
    'calculate_date',
    {
      workdays: 5,
    },
    context
  );

  console.log('执行结果:', JSON.stringify(result, null, 2));
}

/**
 * 示例 5：解析自然语言 - "明天"
 */
async function example5_parseNaturalDate_tomorrow() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 5: 解析 "明天"');
  console.log('='.repeat(50));

  const result = await toolExecutor.execute(
    'parse_natural_date',
    {
      description: '明天',
    },
    context
  );

  console.log('执行结果:', JSON.stringify(result, null, 2));
}

/**
 * 示例 6：解析自然语言 - "下周一"
 */
async function example6_parseNaturalDate_nextMonday() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 6: 解析 "下周一"');
  console.log('='.repeat(50));

  const result = await toolExecutor.execute(
    'parse_natural_date',
    {
      description: '下周一',
    },
    context
  );

  console.log('执行结果:', JSON.stringify(result, null, 2));
}

/**
 * 示例 7：解析自然语言 - "3天后"
 */
async function example7_parseNaturalDate_relative() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 7: 解析 "3天后"');
  console.log('='.repeat(50));

  const result = await toolExecutor.execute(
    'parse_natural_date',
    {
      description: '3天后',
    },
    context
  );

  console.log('执行结果:', JSON.stringify(result, null, 2));
}

/**
 * 示例 8：日期比较 - 距离春节
 */
async function example8_compareDates_springFestival() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 8: 距离 2025 年春节还有多少天');
  console.log('='.repeat(50));

  const result = await toolExecutor.execute(
    'compare_dates',
    {
      date1: '2025-01-29', // 2025年春节
    },
    context
  );

  console.log('执行结果:', JSON.stringify(result, null, 2));
}

/**
 * 示例 9：日期比较 - 两个日期的差距
 */
async function example9_compareDates_twoDate() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 9: 2025-01-01 到 2025-12-31 有多少天');
  console.log('='.repeat(50));

  const result = await toolExecutor.execute(
    'compare_dates',
    {
      date1: '2025-01-01',
      date2: '2025-12-31',
    },
    context
  );

  console.log('执行结果:', JSON.stringify(result, null, 2));
}

/**
 * 示例 10：测试缓存功能
 */
async function example10_testCache() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 10: 测试缓存功能（连续 3 次相同查询）');
  console.log('='.repeat(50));

  const params = { timezone: 'Asia/Shanghai', format: 'iso' };

  // 第一次调用
  console.log('\n第 1 次调用:');
  const result1 = await toolExecutor.execute('get_current_time', params, context);
  console.log(`- 耗时: ${result1.duration}ms`);
  console.log(`- 来自缓存: ${result1.fromCache}`);

  // 第二次调用（应该命中缓存）
  console.log('\n第 2 次调用:');
  const result2 = await toolExecutor.execute('get_current_time', params, context);
  console.log(`- 耗时: ${result2.duration}ms`);
  console.log(`- 来自缓存: ${result2.fromCache}`);

  // 第三次调用（应该命中缓存）
  console.log('\n第 3 次调用:');
  const result3 = await toolExecutor.execute('get_current_time', params, context);
  console.log(`- 耗时: ${result3.duration}ms`);
  console.log(`- 来自缓存: ${result3.fromCache}`);
}

/**
 * 示例 11：查看工具指标
 */
async function example11_viewMetrics() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 11: 查看时间工具的使用指标');
  console.log('='.repeat(50));

  const timeTools = [
    'get_current_time',
    'calculate_date',
    'parse_natural_date',
    'compare_dates',
  ];

  for (const toolName of timeTools) {
    const metrics = toolExecutor.getMetrics(toolName);
    if (metrics) {
      console.log(`\n📊 ${toolName}:`);
      console.log(`   状态: ${metrics.status}`);
      console.log(`   总调用次数: ${metrics.totalCalls}`);
      console.log(`   成功次数: ${metrics.successCalls}`);
      console.log(`   失败次数: ${metrics.failedCalls}`);
      console.log(`   缓存命中率: ${metrics.cacheHitRate}`);
      console.log(`   平均延迟: ${metrics.averageLatency}ms`);
      console.log(`   错误率: ${metrics.errorRate}`);
    }
  }
}

/**
 * 示例 12：实际场景 - 用户问"明天几号？星期几？"
 */
async function example12_realScenario_tomorrow() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 12: 实际场景 - 用户问"明天几号？星期几？"');
  console.log('='.repeat(50));

  // AI 解析用户意图，调用工具
  const result = await toolExecutor.execute(
    'parse_natural_date',
    {
      description: '明天',
    },
    context
  );

  if (result.success) {
    const { chinese, weekday, is_workday } = result.data;
    const workdayText = is_workday ? '工作日' : '休息日';
    
    // AI 组织回复
    const reply = `明天是 ${chinese}，是${workdayText}。`;
    console.log('\n🤖 AI 回复用户:', reply);
  }
}

/**
 * 示例 13：实际场景 - 用户问"3个工作日后是哪天？"
 */
async function example13_realScenario_workdays() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 13: 实际场景 - 用户问"3个工作日后是哪天？"');
  console.log('='.repeat(50));

  // AI 调用工具
  const result = await toolExecutor.execute(
    'calculate_date',
    {
      workdays: 3,
    },
    context
  );

  if (result.success) {
    const { chinese, relative } = result.data;
    
    // AI 组织回复
    const reply = `3 个工作日后是 ${chinese}（${relative}）。`;
    console.log('\n🤖 AI 回复用户:', reply);
  }
}

/**
 * 示例 14：实际场景 - 用户问"距离春节还有多少天？"
 */
async function example14_realScenario_countdown() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 14: 实际场景 - 用户问"距离春节还有多少天？"');
  console.log('='.repeat(50));

  // AI 调用工具
  const result = await toolExecutor.execute(
    'compare_dates',
    {
      date1: '2025-01-29', // 2025年春节
    },
    context
  );

  if (result.success) {
    const { abs_days, weeks } = result.data;
    
    // AI 组织回复
    const reply = `距离 2025 年春节（1月29日）还有 ${abs_days} 天，约 ${weeks} 周。`;
    console.log('\n🤖 AI 回复用户:', reply);
  }
}

/**
 * 主函数 - 运行所有示例
 */
async function main() {
  console.log('\n🚀 时间工具使用示例开始\n');

  try {
    // 基础功能示例
    await example1_getCurrentTime();
    await example2_calculateFutureDate();
    await example3_calculatePastDate();
    await example4_calculateWorkdays();
    await example5_parseNaturalDate_tomorrow();
    await example6_parseNaturalDate_nextMonday();
    await example7_parseNaturalDate_relative();
    await example8_compareDates_springFestival();
    await example9_compareDates_twoDate();

    // 高级功能示例
    await example10_testCache();
    await example11_viewMetrics();

    // 实际场景示例
    await example12_realScenario_tomorrow();
    await example13_realScenario_workdays();
    await example14_realScenario_countdown();

    console.log('\n' + '='.repeat(50));
    console.log('✅ 所有示例执行完成！');
    console.log('='.repeat(50));
  } catch (error) {
    console.error('\n❌ 执行出错:', error);
  }
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  example1_getCurrentTime,
  example2_calculateFutureDate,
  example3_calculatePastDate,
  example4_calculateWorkdays,
  example5_parseNaturalDate_tomorrow,
  example6_parseNaturalDate_nextMonday,
  example7_parseNaturalDate_relative,
  example8_compareDates_springFestival,
  example9_compareDates_twoDate,
  example10_testCache,
  example11_viewMetrics,
  example12_realScenario_tomorrow,
  example13_realScenario_workdays,
  example14_realScenario_countdown,
};

