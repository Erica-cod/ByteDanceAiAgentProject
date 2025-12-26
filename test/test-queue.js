/**
 * 队列化功能测试脚本
 * 
 * 用法：
 * 1. 确保服务已启动（npm run dev）
 * 2. 在另一个终端运行：node test-queue.js
 * 
 * 测试场景：
 * - 模拟 3 个并发请求（超过默认的 maxPerUser=1 或触发全局限制）
 * - 验证队列 token 的返回和重用
 * - 验证 Retry-After 和队列位置
 */

const SERVER_URL = 'http://localhost:8080';
const TEST_USER_ID = `test_user_queue_${Date.now()}`;

async function sendChatRequest(message, queueToken = null) {
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

  console.log(`\n📤 发送请求: ${message.slice(0, 30)}...`, queueToken ? `(token: ${queueToken})` : '');

  try {
    const response = await fetch(`${SERVER_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    console.log(`📡 响应状态: ${response.status} ${response.statusText}`);

    if (response.status === 429) {
      const queueToken = response.headers.get('X-Queue-Token');
      const queuePosition = response.headers.get('X-Queue-Position');
      const retryAfter = response.headers.get('Retry-After');
      const estimatedWait = response.headers.get('X-Queue-Estimated-Wait');

      console.log(`🎫 队列信息:`);
      console.log(`   - Token: ${queueToken}`);
      console.log(`   - Position: ${queuePosition}`);
      console.log(`   - Retry-After: ${retryAfter}s`);
      console.log(`   - Estimated Wait: ${estimatedWait}s`);

      const body = await response.json();
      console.log(`   - Error: ${body.error}`);

      return { status: 429, queueToken, queuePosition, retryAfter: parseInt(retryAfter || '1', 10) };
    }

    if (response.ok) {
      console.log(`✅ 请求成功，进入流式处理`);
      // 不读取完整响应，直接关闭（测试用）
      return { status: 200, queueToken: null };
    }

    const body = await response.json();
    console.log(`❌ 请求失败:`, body);
    return { status: response.status, error: body.error };
  } catch (error) {
    console.error(`❌ 网络错误:`, error.message);
    return { status: -1, error: error.message };
  }
}

async function testQueueing() {
  console.log('🧪 开始测试队列化功能...');
  console.log(`📋 测试用户 ID: ${TEST_USER_ID}`);
  console.log('---');

  // 测试 1：快速发送 3 个请求（触发并发限制）
  console.log('\n【测试 1】快速发送 3 个请求...');
  const promises = [
    sendChatRequest('测试消息 1'),
    sendChatRequest('测试消息 2'),
    sendChatRequest('测试消息 3'),
  ];

  const results = await Promise.all(promises);
  console.log('\n📊 结果汇总:');
  results.forEach((r, i) => {
    console.log(`   请求 ${i + 1}: status=${r.status}, position=${r.queuePosition || 'N/A'}, token=${r.queueToken?.slice(0, 20) || 'N/A'}`);
  });

  // 测试 2：携带 token 重试
  const queuedRequest = results.find((r) => r.status === 429);
  if (queuedRequest && queuedRequest.queueToken) {
    console.log(`\n【测试 2】携带 token 重试...`);
    await new Promise((resolve) => setTimeout(resolve, (queuedRequest.retryAfter || 1) * 1000));
    
    const retryResult = await sendChatRequest('测试消息 1（重试）', queuedRequest.queueToken);
    console.log(`\n📊 重试结果: status=${retryResult.status}, position=${retryResult.queuePosition || 'N/A'}`);
    
    if (retryResult.status === 429) {
      console.log(`   ℹ️ 仍在排队，位置可能有变化`);
    } else if (retryResult.status === 200) {
      console.log(`   ✅ 成功获得名额！`);
    }
  } else {
    console.log(`\n【测试 2】跳过：没有触发 429`);
  }

  console.log('\n✅ 测试完成！');
}

// 运行测试
testQueueing().catch(console.error);

