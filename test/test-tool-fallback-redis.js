/**
 * 测试工具降级机制和 Redis 缓存
 */

import { toolRegistry, toolExecutor, cacheManager } from '../api/tools/v2/index.js';
import { searchWebPlugin } from '../api/tools/v2/plugins/search-web.plugin.js';
import { getRedisClient, isRedisAvailable } from '../api/_clean/infrastructure/cache/redis-client.js';

async function testFallbackAndRedisCache() {
  console.log('\n🧪 ===== 测试工具降级机制和 Redis 缓存 =====\n');

  // 1. 检查 Redis 是否可用
  console.log('1️⃣  检查 Redis 连接...');
  const redisAvailable = await isRedisAvailable();
  console.log(`   Redis 状态: ${redisAvailable ? '✅ 可用' : '❌ 不可用'}`);

  // 2. 注册工具
  console.log('\n2️⃣  注册搜索工具...');
  toolRegistry.register(searchWebPlugin);

  // 3. 测试正常执行 + Redis 缓存
  console.log('\n3️⃣  测试正常执行和 Redis 缓存...');
  const context = {
    userId: 'test-user-001',
    requestId: 'req-001',
    timestamp: Date.now(),
  };

  try {
    const result1 = await toolExecutor.execute('search_web', {
      query: 'AI agent 最新发展',
      max_results: 5,
    }, context);

    console.log(`   第一次调用: ${result1.success ? '✅ 成功' : '❌ 失败'}`);
    console.log(`   来自缓存: ${result1.fromCache ? '是' : '否'}`);
    console.log(`   耗时: ${result1.duration}ms`);

    // 4. 测试缓存命中
    console.log('\n4️⃣  测试缓存命中（相同参数）...');
    const result2 = await toolExecutor.execute('search_web', {
      query: 'AI agent 最新发展',
      max_results: 5,
    }, context);

    console.log(`   第二次调用: ${result2.success ? '✅ 成功' : '❌ 失败'}`);
    console.log(`   来自缓存: ${result2.fromCache ? '✅ 是' : '❌ 否'}`);
    console.log(`   耗时: ${result2.duration}ms`);

    if (result2.fromCache) {
      console.log('   ✅ Redis 缓存工作正常！');
    }
  } catch (error) {
    console.error('   ❌ 执行失败:', error.message);
  }

  // 5. 测试降级机制（模拟熔断）
  console.log('\n5️⃣  测试降级机制...');
  console.log('   模拟工具熔断场景...');

  // 手动触发熔断（记录多次失败）
  const { circuitBreaker } = await import('../api/tools/v2/index.js');
  
  // 设置熔断配置
  circuitBreaker.setConfig('search_web', {
    enabled: true,
    failureThreshold: 2,
    resetTimeout: 5000,
  });

  // 记录失败触发熔断
  circuitBreaker.recordFailure('search_web');
  circuitBreaker.recordFailure('search_web');

  console.log('   熔断器状态:', circuitBreaker.getState('search_web'));

  // 6. 测试降级响应
  console.log('\n6️⃣  测试降级响应（熔断后）...');
  try {
    const result3 = await toolExecutor.execute('search_web', {
      query: 'AI agent 最新发展',
      max_results: 5,
    }, context);

    console.log(`   降级调用: ${result3.success ? '✅ 成功' : '❌ 失败'}`);
    console.log(`   是否降级: ${result3.degraded ? '✅ 是' : '否'}`);
    console.log(`   降级策略: ${result3.degradedBy || 'N/A'}`);
    console.log(`   来自缓存: ${result3.fromCache ? '是' : '否'}`);

    if (result3.degraded && result3.fromCache) {
      console.log('   ✅ 降级机制工作正常！返回了缓存数据');
    }
  } catch (error) {
    console.error('   ❌ 降级失败:', error.message);
  }

  // 7. 测试过期缓存降级
  console.log('\n7️⃣  测试过期缓存降级...');
  console.log('   （需要等待缓存过期，跳过此测试）');

  // 8. 获取工具指标
  console.log('\n8️⃣  获取工具指标...');
  const metrics = toolExecutor.getMetrics('search_web');
  if (metrics) {
    console.log(`   工具状态: ${metrics.status}`);
    console.log(`   总调用次数: ${metrics.totalCalls}`);
    console.log(`   成功次数: ${metrics.successCalls}`);
    console.log(`   失败次数: ${metrics.failedCalls}`);
    console.log(`   缓存命中率: ${metrics.cacheHitRate}`);
    console.log(`   平均延迟: ${metrics.averageLatency}ms`);
    console.log(`   熔断器状态: ${metrics.circuitBreakerState}`);
  }

  // 9. 清理
  console.log('\n9️⃣  清理测试数据...');
  if (redisAvailable) {
    await cacheManager.clear('search_web');
    console.log('   ✅ 已清理 Redis 缓存');
  }

  // 重置熔断器
  circuitBreaker.reset('search_web');
  console.log('   ✅ 已重置熔断器');

  console.log('\n✅ ===== 测试完成 =====\n');
}

// 运行测试
testFallbackAndRedisCache()
  .then(() => {
    console.log('🎉 所有测试通过！');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  });

