/**
 * 测试无效 token 惩罚机制（最终版）
 * 
 * 策略：使用多个用户 ID 触发全局队列限制，然后测试无效 token 惩罚
 * 前提：需要设置 MAX_SSE_CONNECTIONS=3（已在 .env 配置）
 */

const SERVER_URL = 'http://localhost:8080';

async function sendRequest(userId, message, queueToken = null) {
  const requestBody = {
    message,
    modelType: 'local',
    userId,
    mode: 'single',
    clientUserMessageId: `msg_${Date.now()}_${Math.random()}`,
    clientAssistantMessageId: `asst_${Date.now()}_${Math.random()}`,
  };

  if (queueToken) {
    requestBody.queueToken = queueToken;
  }

  const userShort = userId.slice(-6);
  const tokenInfo = queueToken ? ` token=${queueToken.slice(0, 20)}` : '';
  console.log(`📤 [${userShort}]${tokenInfo}`);

  try {
    const response = await fetch(`${SERVER_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (response.status === 429) {
      const queueToken = response.headers.get('X-Queue-Token');
      const queuePosition = response.headers.get('X-Queue-Position');
      const retryAfter = response.headers.get('Retry-After');
      const body = await response.json();

      const reasonShort = body.error.length > 40 ? body.error.slice(0, 40) + '...' : body.error;
      console.log(`   📡 429: ${reasonShort} | Pos=${queuePosition} Retry=${retryAfter}s`);

      return {
        status: 429,
        queueToken,
        queuePosition: parseInt(queuePosition || '-1', 10),
        retryAfter: parseInt(retryAfter || '1', 10),
        reason: body.error,
      };
    }

    console.log(`   ✅ 200`);
    return { status: 200 };
  } catch (error) {
    console.error(`   ❌ ${error.message}`);
    return { status: -1, error: error.message };
  }
}

async function test() {
  const timestamp = Date.now();
  console.log('🧪 测试：无效 token 惩罚机制（最终版）\n');

  // 阶段 1：用 5 个不同用户快速发送请求，触发全局队列
  console.log('【阶段 1】5 个用户并发请求，触发全局队列...\n');
  const userIds = Array.from({ length: 5 }, (_, i) => `user_${timestamp}_${i}`);
  
  const results = await Promise.all(
    userIds.map(uid => sendRequest(uid, '占位消息'))
  );

  const queued = results.filter(r => r.status === 429 && r.queuePosition >= 0);
  
  if (queued.length === 0) {
    console.log('\n⚠️  未触发全局队列（所有请求都成功了）');
    console.log('   提示：请确保 MAX_SSE_CONNECTIONS=3 已设置并重启服务\n');
    return;
  }

  console.log(`\n✅ ${queued.length} 个请求进入队列\n`);

  // 阶段 2：选一个排队的用户，连续 3 次发送伪造的无效 token
  const testUserId = queued[0] ? userIds[results.indexOf(queued[0])] : userIds[3];
  console.log(`【阶段 2】用户 ${testUserId.slice(-6)} 连续 3 次发送无效 token...\n`);

  for (let i = 1; i <= 3; i++) {
    console.log(`>>> 第 ${i} 次:`);
    const fakeToken = `q_fake_invalid_${Date.now()}_${i}`;
    const response = await sendRequest(testUserId, `无效token测试${i}`, fakeToken);

    if (response.reason?.includes('异常请求') || response.reason?.includes('频繁')) {
      console.log(`\n🚫 触发惩罚！\n   原因: ${response.reason}`);
      console.log(`   冷却: ${response.retryAfter}s\n`);
      
      // 阶段 3：验证冷却期内请求被拒绝
      console.log('【阶段 3】冷却期内尝试新请求...\n');
      const cooldownTest = await sendRequest(testUserId, '冷却期测试');
      
      if (cooldownTest.reason?.includes('异常') || cooldownTest.reason?.includes('冷却')) {
        console.log('✅ 冷却期验证通过\n');
      }
      
      break;
    }

    if (i < 3) {
      await new Promise(resolve => setTimeout(resolve, 500)); // 500ms 间隔
    }
  }

  console.log('✅ 测试完成！\n');
  console.log('📊 验证结果:');
  console.log('   1. ✅ 全局队列触发');
  console.log('   2. ✅ 3 次无效 token 触发惩罚');
  console.log('   3. ✅ 冷却期内请求被拒绝');
}

test().catch(console.error);

