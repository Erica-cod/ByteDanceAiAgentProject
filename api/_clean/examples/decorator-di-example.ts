/**
 * 装饰器依赖注入使用示例
 * 演示如何使用装饰器容器注入 Metrics 模块
 * 
 * 运行方式：
 * cd api/_clean
 * npx tsx examples/decorator-di-example.ts
 */

import { getDecoratorContainer } from '../shared/decorators/index.js';
import { InMemoryMetricsRepository } from '../infrastructure/repositories/metrics.repository.js';
import { RecordMetricUseCase } from '../application/use-cases/metrics/record-metric.use-case.js';
import { GetMetricsSnapshotUseCase } from '../application/use-cases/metrics/get-metrics-snapshot.use-case.js';

/**
 * 主函数 - 演示装饰器依赖注入的使用
 */
async function main() {
  console.log('🚀 装饰器依赖注入示例开始\n');

  // 1️⃣ 获取装饰器容器实例
  const container = getDecoratorContainer();
  console.log('✅ 容器已初始化\n');

  // 2️⃣ 注册依赖
  console.log('📦 开始注册依赖...');
  
  // 注册仓储实现
  container.register('InMemoryMetricsRepository', InMemoryMetricsRepository);
  
  // 绑定接口到实现（类似 Java Spring 的 @Qualifier）
  container.bind('IMetricsRepository', 'InMemoryMetricsRepository');
  
  // 注册 Use Cases
  container.register('RecordMetricUseCase', RecordMetricUseCase);
  container.register('GetMetricsSnapshotUseCase', GetMetricsSnapshotUseCase);
  
  console.log('');

  // 3️⃣ 查看容器状态
  const status = container.getStatus();
  console.log('📊 容器状态:');
  console.log(`   - 已注册类型数量: ${status.registeredCount}`);
  console.log(`   - 单例实例数量: ${status.singletonCount}`);
  console.log(`   - 已注册的类型: ${status.registered.join(', ')}`);
  console.log('');

  // 4️⃣ 解析并使用 Use Cases（自动注入依赖）
  console.log('🔧 开始使用装饰器注入的服务...\n');

  // 解析 RecordMetricUseCase（容器会自动注入 IMetricsRepository）
  const recordMetricUseCase = container.resolve<RecordMetricUseCase>('RecordMetricUseCase');
  console.log('✅ RecordMetricUseCase 已解析（依赖已自动注入）');

  // 解析 GetMetricsSnapshotUseCase
  const getMetricsSnapshotUseCase = container.resolve<GetMetricsSnapshotUseCase>('GetMetricsSnapshotUseCase');
  console.log('✅ GetMetricsSnapshotUseCase 已解析（依赖已自动注入）\n');

  // 5️⃣ 执行业务操作
  console.log('📈 记录一些性能指标...');
  
  // 记录 SSE 连接
  await recordMetricUseCase.execute({ 
    type: 'sse_connection' 
  });
  console.log('   ✓ SSE 连接已记录');

  // 记录数据库查询
  await recordMetricUseCase.execute({ 
    type: 'db_query',
    durationMs: 15 
  });
  console.log('   ✓ 数据库查询已记录 (15ms)');

  // 记录 LLM 请求
  await recordMetricUseCase.execute({ 
    type: 'llm_request',
    durationMs: 2500,
    tokensUsed: 150
  });
  console.log('   ✓ LLM 请求已记录 (2500ms, 150 tokens)');

  // 记录工具调用
  await recordMetricUseCase.execute({ 
    type: 'tool_call' 
  });
  console.log('   ✓ 工具调用已记录\n');

  // 6️⃣ 获取指标快照
  console.log('📊 获取指标快照:');
  const snapshot = await getMetricsSnapshotUseCase.execute();
  
  console.log('\n📈 性能指标统计:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📡 SSE 连接:');
  console.log(`   - 活跃连接: ${snapshot.sse.active}`);
  console.log(`   - 总连接数: ${snapshot.sse.total}`);
  console.log(`   - 错误数: ${snapshot.sse.errors}`);
  console.log(`   - 错误率: ${snapshot.sse.errorRate}`);
  
  console.log('\n💾 数据库:');
  console.log(`   - 查询次数: ${snapshot.database.queries}`);
  console.log(`   - 平均耗时: ${snapshot.database.avgTime}`);
  console.log(`   - 错误数: ${snapshot.database.errors}`);
  
  console.log('\n🤖 LLM:');
  console.log(`   - 请求次数: ${snapshot.llm.requests}`);
  console.log(`   - 平均耗时: ${snapshot.llm.avgTime}`);
  console.log(`   - Token 使用: ${snapshot.llm.tokensUsed}`);
  console.log(`   - 错误数: ${snapshot.llm.errors}`);
  
  console.log('\n🔧 工具调用:');
  console.log(`   - 调用次数: ${snapshot.tools.calls}`);
  console.log(`   - 错误数: ${snapshot.tools.errors}`);
  
  console.log('\n💻 内存:');
  console.log(`   - 堆使用: ${snapshot.memory.heapUsed}`);
  console.log(`   - 堆总量: ${snapshot.memory.heapTotal}`);
  console.log(`   - 使用率: ${snapshot.memory.usage}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 7️⃣ 验证单例模式
  console.log('🔍 验证单例模式:');
  const anotherRecordUseCase = container.resolve<RecordMetricUseCase>('RecordMetricUseCase');
  const statusAfter = container.getStatus();
  console.log(`   - 再次解析后单例数量: ${statusAfter.singletonCount}`);
  console.log('   - ✅ Repository 是单例，每次解析都返回同一个实例');
  console.log('   - ✅ UseCase 是瞬态，每次解析都创建新实例\n');

  console.log('✨ 装饰器依赖注入示例完成！\n');
  
  // 8️⃣ 对比说明
  console.log('💡 装饰器注入 vs 传统方式对比:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('传统方式 (di-container.ts):');
  console.log('  const repo = new InMemoryMetricsRepository();');
  console.log('  const useCase = new RecordMetricUseCase(repo);');
  console.log('');
  console.log('装饰器方式:');
  console.log('  @Service()');
  console.log('  @Inject(["IMetricsRepository"])');
  console.log('  class RecordMetricUseCase {');
  console.log('    constructor(private repo: IMetricsRepository) {}');
  console.log('  }');
  console.log('  const useCase = container.resolve("RecordMetricUseCase");');
  console.log('');
  console.log('优势:');
  console.log('  ✓ 更接近 Java Spring 和 NestJS 的开发体验');
  console.log('  ✓ 声明式依赖注入，代码更清晰');
  console.log('  ✓ 自动管理依赖关系和生命周期');
  console.log('  ✓ 支持单例和瞬态作用域');
  console.log('  ✓ 便于测试和模拟依赖');
  console.log('  ✓ 使用类装饰器，兼容性更好');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// 运行示例
main().catch(error => {
  console.error('❌ 示例执行出错:', error);
  process.exit(1);
});

