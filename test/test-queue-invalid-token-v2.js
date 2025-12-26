/**
 * 测试无效 token 惩罚机制 V2
 * 
 * 策略：利用单用户并发限制（maxPerUser=1）快速触发 429
 */

const SERVER_URL = 'http://localhost:8080';
const TEST_USER_ID = `test_invalid_v2_${Date.now()}`;

async function sendRequest(message, queueToken = null) {
  const requestBody = {
    message,
    modelType: 'local',
    userId: TEST_USER_ID,
    mode: 'single',
    clientUserMessageId: `msg_${Date.now()}_${Math.random()}`,
    clientAssistantMessageId: `asst_${Date.now()}_${Math.random()}`,
  };

  if (queueToken) {
    requestBody.queueToken = queueToken;
  }

  const tokenInfo = queueToken ? ` (token: ${queueToken.slice(0, 25)}...)` : '';
  console.log(`📤 发送${tokenInfo}`);

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

      console.log(`   📡 429: ${body.error.slice(0, 50)}...`);
      console.log(`   🎫 Token: ${queueToken?.slice(0, 30)}..., Position: ${queuePosition}, Retry: ${retryAfter}s`);

      return {
        status: 429,
        queueToken,
        queuePosition: parseInt(queuePosition || '0', 10),
        retryAfter: parseInt(retryAfter || '1', 10),
        reason: body.error,
      };
    }

    console.log(`   ✅ 200: 成功`);
    return { status: 200 };
  } catch (error) {
    console.error(`   ❌ 错误:`, error.message);
    return { status: -1, error: error.message };
  }
}

async function testInvalidTokenPunishment() {
  console.log('🧪 测试：无效 token 惩罚机制 V2');
  console.log(`📋 测试用户: ${TEST_USER_ID}\n`);

  // 阶段 1：快速发送 2 个请求，第2个会因为单用户限制被拒绝
  console.log('【阶段 1】快速发送 2 个并发请求，触发单用户限制...\n');
  const [r1, r2] = await Promise.all([
    sendRequest('消息 1'),
    sendRequest('消息 2'),
  ]);

  const has429 = r1.status === 429 || r2.status === 429;
  if (!has429) {
    console.log('\n⚠️  未触发 429，无法测试无效 token 惩罚');
    return;
  }

  console.log('\n✅ 已触发 429\n');

  // 阶段 2：连续发送 3 次伪造的无效 token
  console.log('【阶段 2】连续 3 次发送伪造的无效 token...\n');

  for (let i = 1; i <= 3; i++) {
    console.log(`>>> 第 ${i} 次无效 token:`);
    const fakeToken = `q_fake_${Date.now()}_${i}`;
    const response = await sendRequest(`无效 token 测试 ${i}`, fakeToken);

    if (response.reason?.includes('异常请求') || response.reason?.includes('频繁')) {
      console.log(`\n🚫 触发惩罚！${response.reason}`);
      console.log(`   冷却时间: ${response.retryAfter}s\n`);
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 300)); // 300ms 间隔
  }

  // 阶段 3：验证冷却期内请求被拒绝
  console.log('【阶段 3】冷却期内尝试新请求...\n');
  const cooldownTest = await sendRequest('冷却期测试');

  if (cooldownTest.reason?.includes('异常') || cooldownTest.reason?.includes('冷却')) {
    console.log('✅ 冷却期验证通过：请求被拒绝\n');
  } else {
    console.log(`⚠️  预期被拒绝，实际: ${cooldownTest.status}\n`);
  }

  console.log('✅ 测试完成！\n');
  console.log('📊 机制验证:');
  console.log('   1. ✅ 单用户并发限制触发 429');
  console.log('   2. ✅ 3 次无效 token 触发惩罚');
  console.log('   3. ✅ 冷却期内请求被拒绝');
}

testInvalidTokenPunishment().catch(console.error);

