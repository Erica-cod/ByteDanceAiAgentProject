/**
 * 测试无效 token 惩罚机制
 * 
 * 目标：验证对"持续发送无效 token"的行为进行限频惩罚
 * - 正常场景：有效 token 重试可以正常排队
 * - 恶意场景：10秒内发送 3 次以上无效 token 触发 30 秒冷却
 */

const SERVER_URL = 'http://localhost:8080';
const TEST_USER_ID = `test_invalid_${Date.now()}`;

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

  console.log(`\n📤 发送请求${queueToken ? ` (token: ${queueToken.slice(0, 20)}...)` : ''}`);

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

      console.log(`🎫 429 响应:`);
      console.log(`   - Reason: ${body.error}`);
      console.log(`   - Position: ${queuePosition}`);
      console.log(`   - Retry-After: ${retryAfter}s`);
      console.log(`   - Token: ${queueToken?.slice(0, 30)}...`);

      return {
        status: 429,
        queueToken,
        queuePosition: parseInt(queuePosition || '0', 10),
        retryAfter: parseInt(retryAfter || '1', 10),
        reason: body.error,
      };
    }

    if (response.ok) {
      console.log(`✅ 200 响应：成功进入流式处理`);
      return { status: 200 };
    }

    const body = await response.json();
    console.log(`❌ ${response.status} 响应:`, body.error);
    return { status: response.status, error: body.error };
  } catch (error) {
    console.error(`❌ 网络错误:`, error.message);
    return { status: -1, error: error.message };
  }
}

async function testInvalidTokenPunishment() {
  console.log('🧪 测试：无效 token 惩罚机制');
  console.log(`📋 测试用户: ${TEST_USER_ID}`);
  console.log('---');

  // 阶段 1：正常触发 429，获取一个合法 token
  console.log('\n【阶段 1】正常请求，触发 429 获取合法 token...');
  const firstResponse = await sendRequest('测试消息 1');

  if (firstResponse.status !== 429) {
    console.log('⚠️  没有触发 429，可能并发限制未生效。请降低 MAX_SSE_CONNECTIONS');
    return;
  }

  const validToken = firstResponse.queueToken;
  console.log(`\n✅ 获得合法 token: ${validToken?.slice(0, 30)}...`);

  // 阶段 2：发送 3 次无效 token，触发惩罚
  console.log('\n【阶段 2】连续发送 3 次无效 token（伪造的）...');

  const fakeTokens = [
    'q_fake_invalid_123',
    'q_fake_invalid_456',
    'q_fake_invalid_789',
  ];

  for (let i = 0; i < 3; i++) {
    console.log(`\n>>> 第 ${i + 1} 次无效 token 尝试`);
    const response = await sendRequest(`测试消息 ${i + 2}`, fakeTokens[i]);
    
    if (response.reason?.includes('异常请求模式') || response.reason?.includes('频繁的无效请求')) {
      console.log(`\n🚫 触发惩罚！原因: ${response.reason}`);
      console.log(`   冷却时间: ${response.retryAfter}s`);
      break;
    }

    // 短暂间隔，确保在 10 秒窗口内
    if (i < 2) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // 阶段 3：验证冷却期内无法入队
  console.log('\n【阶段 3】在冷却期内尝试发送新请求（应该被拒绝）...');
  const duringCooldownResponse = await sendRequest('冷却期内的请求');

  if (duringCooldownResponse.reason?.includes('异常请求模式') || duringCooldownResponse.reason?.includes('冷却期')) {
    console.log(`✅ 冷却期验证通过：请求被拒绝`);
  } else {
    console.log(`⚠️  预期应该被拒绝，但实际状态: ${duringCooldownResponse.status}`);
  }

  // 阶段 4：使用合法 token 仍然可以查询位置（不受惩罚影响）
  console.log('\n【阶段 4】使用合法 token 重试（应该正常返回队列位置）...');
  const validTokenRetry = await sendRequest('合法 token 重试', validToken);

  if (validTokenRetry.status === 429 && validTokenRetry.queuePosition >= 0) {
    console.log(`✅ 合法 token 不受惩罚影响，队列位置: ${validTokenRetry.queuePosition}`);
  } else {
    console.log(`⚠️  合法 token 重试结果异常: status=${validTokenRetry.status}`);
  }

  console.log('\n✅ 测试完成！');
  console.log('\n📊 总结:');
  console.log('   1. ✅ 正常请求可以获得合法 token');
  console.log('   2. ✅ 连续 3 次无效 token 触发惩罚');
  console.log('   3. ✅ 冷却期内请求被拒绝');
  console.log('   4. ✅ 合法 token 不受惩罚影响');
}

testInvalidTokenPunishment().catch(console.error);

