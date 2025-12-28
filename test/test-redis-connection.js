/**
 * Redis 连接测试脚本
 * 
 * 快速测试 Redis 是否可用
 * 运行方式：node test/test-redis-connection.js
 */

import { createClient } from 'redis';

const REDIS_CONFIG = {
  socket: {
    host: 'localhost',
    port: 6379,
  },
  password: 'your_redis_password',
};

async function testRedisConnection() {
  console.log('🔍 测试 Redis 连接...\n');
  
  const client = createClient(REDIS_CONFIG);
  
  client.on('error', (err) => {
    console.error('❌ Redis 错误:', err.message);
  });

  try {
    await client.connect();
    console.log('✅ Redis 连接成功!\n');

    // 测试基本操作
    console.log('📝 测试基本操作...');
    
    await client.set('test_key', 'test_value', { EX: 10 });
    console.log('  ✅ SET test_key = test_value (10秒过期)');
    
    const value = await client.get('test_key');
    console.log(`  ✅ GET test_key = ${value}`);
    
    await client.del('test_key');
    console.log('  ✅ DEL test_key');

    // 查询现有的 multi_agent 键
    console.log('\n🔍 查询现有的 multi_agent 缓存...');
    const keys = await client.keys('multi_agent:*');
    
    if (keys.length > 0) {
      console.log(`  找到 ${keys.length} 个缓存:`);
      for (const key of keys) {
        const ttl = await client.ttl(key);
        console.log(`    - ${key} (TTL: ${ttl}秒)`);
      }
    } else {
      console.log('  未找到任何缓存（这是正常的，除非有正在进行的会话）');
    }

    console.log('\n✅ 所有测试通过!');
    console.log('Redis 配置正确，可以运行断点续传测试了。\n');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 提示:');
      console.error('  1. 确保 Redis 容器正在运行:');
      console.error('     docker ps | findstr redis');
      console.error('  2. 如果未运行，请启动:');
      console.error('     docker-compose up -d redis');
    } else if (error.message.includes('WRONGPASS')) {
      console.error('\n💡 提示:');
      console.error('  Redis 密码错误，请检查:');
      console.error('  1. docker-compose.yml 中的密码');
      console.error('  2. 测试脚本中的 REDIS_PASSWORD');
    }
    
    process.exit(1);
  } finally {
    await client.quit();
  }
}

testRedisConnection();

