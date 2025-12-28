/**
 * Redis 优化效果测试
 * 
 * 测试内容：
 * 1. 压缩率测试
 * 2. 读写性能测试
 * 3. 动态 TTL 验证
 * 4. 滑动过期验证
 */

import { createClient } from 'redis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'your_password_here';

// 模拟一个多 Agent 会话状态
function generateMockState(round = 1) {
  return {
    completedRounds: round,
    sessionState: {
      status: 'running',
      current_round: round,
      agents: {
        planner: {
          role: 'planner',
          last_output: {
            content: '计划阶段完成。我们需要分析用户的问题，确定解决方案的步骤。' + '这是一段很长的文本内容。'.repeat(20),
            reasoning: '这是推理过程。'.repeat(10),
            timestamp: Date.now(),
          },
        },
        critic: {
          role: 'critic',
          last_output: {
            content: '评审阶段完成。计划看起来合理，但需要注意一些细节。' + '这是一段很长的文本内容。'.repeat(30),
            critique: '这是批评内容。'.repeat(15),
            timestamp: Date.now(),
          },
        },
        expert_a: {
          role: 'expert_a',
          last_output: {
            content: '专家 A 的分析完成。从技术角度来看，方案是可行的。' + '这是一段很长的文本内容。'.repeat(40),
            analysis: '这是分析内容。'.repeat(20),
            timestamp: Date.now(),
          },
        },
        expert_b: {
          role: 'expert_b',
          last_output: {
            content: '专家 B 的分析完成。从业务角度来看，方案符合需求。' + '这是一段很长的文本内容。'.repeat(40),
            analysis: '这是分析内容。'.repeat(20),
            timestamp: Date.now(),
          },
        },
        reporter: {
          role: 'reporter',
          last_output: {
            content: '报告生成完成。以下是本轮讨论的总结。' + '这是一段很长的文本内容。'.repeat(50),
            summary: '这是总结内容。'.repeat(25),
            timestamp: Date.now(),
          },
        },
      },
      rounds: Array.from({ length: round }, (_, i) => ({
        round: i + 1,
        outputs: {
          planner: '计划内容',
          critic: '评审内容',
          expert_a: '专家 A 内容',
          expert_b: '专家 B 内容',
          reporter: '报告内容',
        },
      })),
      consensus_trend: [0.6, 0.7, 0.8],
    },
    userQuery: '这是用户的问题，请帮我分析一下如何实现一个复杂的 AI 系统。',
    timestamp: Date.now(),
    version: 1,
  };
}

async function runTest() {
  console.log('\n🧪 ===== Redis 优化效果测试 =====\n');

  const client = createClient({
    socket: {
      host: REDIS_HOST,
      port: REDIS_PORT,
    },
    password: REDIS_PASSWORD,
  });

  client.on('error', (err) => console.error('❌ Redis 错误:', err));

  try {
    await client.connect();
    console.log('✅ Redis 连接成功\n');

    // ==========================================
    // 测试 1: 压缩率测试
    // ==========================================
    console.log('📦 测试 1: 压缩率测试');
    console.log('━'.repeat(50));

    const state = generateMockState(3);
    const jsonString = JSON.stringify(state);
    const uncompressedSize = Buffer.from(jsonString, 'utf-8').length;

    console.log(`原始数据大小: ${uncompressedSize} bytes (${(uncompressedSize / 1024).toFixed(2)} KB)`);

    // 模拟压缩（Node.js 内置 zlib）
    const { gzip } = await import('zlib');
    const { promisify } = await import('util');
    const gzipAsync = promisify(gzip);

    const compressed = await gzipAsync(Buffer.from(jsonString));
    const compressedSize = compressed.length;

    console.log(`压缩后大小: ${compressedSize} bytes (${(compressedSize / 1024).toFixed(2)} KB)`);
    console.log(`压缩率: ${((1 - compressedSize / uncompressedSize) * 100).toFixed(1)}%`);
    console.log(`节省内存: ${uncompressedSize - compressedSize} bytes\n`);

    // ==========================================
    // 测试 2: 读写性能测试
    // ==========================================
    console.log('⚡ 测试 2: 读写性能测试');
    console.log('━'.repeat(50));

    const testKey = 'test:performance';
    const iterations = 10;

    // 测试写入性能（无压缩）
    let totalWriteTime = 0;
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await client.setEx(testKey, 60, jsonString);
      totalWriteTime += Date.now() - start;
    }
    console.log(`无压缩写入 (${iterations} 次): 平均 ${(totalWriteTime / iterations).toFixed(2)}ms`);

    // 测试写入性能（有压缩）
    totalWriteTime = 0;
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      const compressed = await gzipAsync(Buffer.from(jsonString));
      await client.setEx(testKey, 60, compressed);
      totalWriteTime += Date.now() - start;
    }
    console.log(`有压缩写入 (${iterations} 次): 平均 ${(totalWriteTime / iterations).toFixed(2)}ms`);

    // 测试读取性能（无压缩）
    await client.setEx(testKey, 60, jsonString);
    let totalReadTime = 0;
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await client.get(testKey);
      totalReadTime += Date.now() - start;
    }
    console.log(`无压缩读取 (${iterations} 次): 平均 ${(totalReadTime / iterations).toFixed(2)}ms`);

    // 测试读取性能（有压缩）
    const { gunzip } = await import('zlib');
    const gunzipAsync = promisify(gunzip);
    const compressedData = await gzipAsync(Buffer.from(jsonString));
    await client.setEx(testKey, 60, compressedData);

    totalReadTime = 0;
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      const data = await client.get(testKey);
      await gunzipAsync(Buffer.from(data, 'base64'));
      totalReadTime += Date.now() - start;
    }
    console.log(`有压缩读取 (${iterations} 次): 平均 ${(totalReadTime / iterations).toFixed(2)}ms\n`);

    // ==========================================
    // 测试 3: 动态 TTL 验证
    // ==========================================
    console.log('⏱️  测试 3: 动态 TTL 验证');
    console.log('━'.repeat(50));

    const BASE_TTL = 180; // 3 分钟
    const PER_ROUND_TTL = 60; // 每轮 1 分钟

    for (let round = 1; round <= 5; round++) {
      const remainingRounds = Math.max(1, 5 - round);
      const ttl = BASE_TTL + remainingRounds * PER_ROUND_TTL;
      console.log(`第 ${round} 轮: TTL = ${ttl}s (${(ttl / 60).toFixed(1)} 分钟)`);
    }
    console.log('');

    // ==========================================
    // 测试 4: 滑动过期验证
    // ==========================================
    console.log('🔄 测试 4: 滑动过期验证');
    console.log('━'.repeat(50));

    const slideKey = 'test:sliding';
    await client.setEx(slideKey, 10, 'test data');

    console.log('初始 TTL: 10s');

    // 等待 3 秒
    await new Promise((resolve) => setTimeout(resolve, 3000));
    let ttl = await client.ttl(slideKey);
    console.log(`3 秒后 TTL: ${ttl}s`);

    // 续期
    await client.expire(slideKey, 10);
    ttl = await client.ttl(slideKey);
    console.log(`续期后 TTL: ${ttl}s`);

    // 清理
    await client.del(slideKey);
    console.log('');

    // ==========================================
    // 测试 5: 内存占用估算
    // ==========================================
    console.log('💾 测试 5: 内存占用估算');
    console.log('━'.repeat(50));

    const scenarios = [
      { name: '1,000 并发会话', count: 1000 },
      { name: '5,000 并发会话', count: 5000 },
      { name: '10,000 并发会话', count: 10000 },
    ];

    for (const scenario of scenarios) {
      const uncompressedTotal = (uncompressedSize * scenario.count) / (1024 * 1024);
      const compressedTotal = (compressedSize * scenario.count) / (1024 * 1024);
      console.log(`${scenario.name}:`);
      console.log(`  - 无压缩: ${uncompressedTotal.toFixed(2)} MB`);
      console.log(`  - 有压缩: ${compressedTotal.toFixed(2)} MB (节省 ${(uncompressedTotal - compressedTotal).toFixed(2)} MB)`);
    }
    console.log('');

    // 清理测试数据
    await client.del(testKey);

    console.log('✅ 所有测试完成！');
  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    await client.quit();
    console.log('\n👋 Redis 连接已关闭\n');
  }
}

runTest().catch(console.error);

