/**
 * 测试请求缓存功能
 * 
 * 运行方式：
 * node test/test-request-cache.js
 */

// ✅ 加载环境变量（必须在最前面）
import '../api/config/env.js';

import { getContainer } from '../api/_clean/di-container.js';
import { requestCacheService } from '../api/_clean/infrastructure/cache/request-cache.service.js';
import { connectToDatabase } from '../api/db/connection.js';

async function testRequestCache() {
  console.log('========================================');
  console.log('🧪 测试请求缓存功能');
  console.log('========================================\n');

  try {
    // 1. 连接数据库
    console.log('1️⃣ 连接数据库...');
    await connectToDatabase();
    console.log('✅ 数据库连接成功\n');

    // 2. 确保索引存在
    console.log('2️⃣ 创建缓存索引...');
    const container = getContainer();
    await container.ensureRequestCacheIndexes();
    console.log('✅ 索引创建完成\n');

    // 3. 检查缓存服务是否可用
    console.log('3️⃣ 检查缓存服务...');
    const isAvailable = requestCacheService.isAvailable();
    console.log(`   缓存服务可用: ${isAvailable ? '是' : '否'}`);
    
    if (!isAvailable) {
      console.log('⚠️  缓存服务不可用，请配置 ARK_API_KEY 环境变量');
      console.log('   测试将跳过 embedding 相关功能\n');
    } else {
      console.log('✅ 缓存服务可用\n');
    }

    // 4. 测试保存缓存
    console.log('4️⃣ 测试保存缓存...');
    const testUserId = 'test-user-' + Date.now();
    const testRequest = '什么是人工智能？';
    const testResponse = '人工智能（AI）是计算机科学的一个分支，致力于创建能够执行通常需要人类智能的任务的系统。';
    
    if (isAvailable) {
      await requestCacheService.saveToCache(
        testRequest,
        testResponse,
        testUserId,
        {
          modelType: 'volcano',
          mode: 'single',
          metadata: {
            testMode: true,
            timestamp: Date.now(),
          },
          ttlDays: 1, // 测试缓存1天后过期
        }
      );
      console.log('✅ 缓存保存成功\n');
    } else {
      console.log('⏭️  跳过保存测试（需要 embedding 服务）\n');
    }

    // 5. 测试查找相似缓存
    console.log('5️⃣ 测试查找相似缓存...');
    
    if (isAvailable) {
      // 测试完全相同的请求
      console.log('   测试1: 完全相同的请求');
      const cachedResponse1 = await requestCacheService.findCachedResponse(
        testRequest,
        testUserId,
        {
          modelType: 'volcano',
          mode: 'single',
          similarityThreshold: 0.95,
        }
      );
      
      if (cachedResponse1) {
        console.log('   ✅ 找到缓存!');
        console.log(`      命中次数: ${cachedResponse1.hitCount}`);
        console.log(`      响应长度: ${cachedResponse1.content.length} 字符`);
      } else {
        console.log('   ❌ 未找到缓存');
      }
      
      // 测试相似的请求
      console.log('\n   测试2: 相似的请求');
      const cachedResponse2 = await requestCacheService.findCachedResponse(
        '人工智能是什么？', // 语义相似但表述不同
        testUserId,
        {
          modelType: 'volcano',
          mode: 'single',
          similarityThreshold: 0.90, // 降低阈值
        }
      );
      
      if (cachedResponse2) {
        console.log('   ✅ 找到相似缓存!');
        console.log(`      命中次数: ${cachedResponse2.hitCount}`);
      } else {
        console.log('   ℹ️  未找到相似缓存（可能阈值太高）');
      }
      
      // 测试不相关的请求
      console.log('\n   测试3: 不相关的请求');
      const cachedResponse3 = await requestCacheService.findCachedResponse(
        '今天天气怎么样？', // 完全不相关
        testUserId,
        {
          modelType: 'volcano',
          mode: 'single',
          similarityThreshold: 0.95,
        }
      );
      
      if (cachedResponse3) {
        console.log('   ⚠️  意外找到缓存（不应该匹配）');
      } else {
        console.log('   ✅ 正确：未找到缓存');
      }
      
      console.log();
    } else {
      console.log('⏭️  跳过查找测试（需要 embedding 服务）\n');
    }

    // 6. 测试缓存统计
    console.log('6️⃣ 测试缓存统计...');
    const stats = await requestCacheService.getStats(testUserId);
    console.log('   统计信息:');
    console.log(`      总缓存数: ${stats.totalCaches}`);
    console.log(`      总命中次数: ${stats.totalHits}`);
    console.log(`      平均命中次数: ${stats.avgHitCount.toFixed(2)}`);
    console.log(`      命中率: ${(stats.hitRate * 100).toFixed(2)}%`);
    console.log();

    // 7. 测试清理过期缓存
    console.log('7️⃣ 测试清理过期缓存...');
    const deletedCount = await requestCacheService.cleanupExpired();
    console.log(`   清理了 ${deletedCount} 个过期缓存\n`);

    console.log('========================================');
    console.log('✅ 所有测试完成！');
    console.log('========================================');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

// 运行测试
testRequestCache();

