/**
 * 测试全局队列（多用户场景）
 * 
 * 目标：触发全局并发限制（MAX_SSE_CONNECTIONS），而非单用户限制
 */

const SERVER_URL = 'http://localhost:8080';

async function sendChatRequest(userId, message, queueToken = null) {
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

  console.log(`\n📤 [用户 ${userId.slice(-3)}] 发送请求: ${message.slice(0, 20)}...`, queueToken ? `(token: ${queueToken.slice(0, 15)}...)` : '');

  try {
    const response = await fetch(`${SERVER_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    console.log(`📡 [用户 ${userId.slice(-3)}] 响应: ${response.status}`);

    if (response.status === 429) {
      const queueToken = response.headers.get('X-Queue-Token');
      const queuePosition = response.headers.get('X-Queue-Position');
      const retryAfter = response.headers.get('Retry-After');
      const estimatedWait = response.headers.get('X-Queue-Estimated-Wait');

      const body = await response.json();
      
      console.log(`🎫 [用户 ${userId.slice(-3)}] 队列信息:`);
      console.log(`   - Position: ${queuePosition}`);
      console.log(`   - Retry-After: ${retryAfter}s`);
      console.log(`   - Estimated Wait: ${estimatedWait}s`);
      console.log(`   - Token: ${queueToken?.slice(0, 25)}...`);
      console.log(`   - Reason: ${body.error}`);

      return { 
        status: 429, 
        queueToken, 
        queuePosition: parseInt(queuePosition || '0', 10), 
        retryAfter: parseInt(retryAfter || '1', 10),
        reason: body.error 
      };
    }

    if (response.ok) {
      console.log(`✅ [用户 ${userId.slice(-3)}] 成功进入流式处理`);
      return { status: 200 };
    }

    const body = await response.json();
    console.log(`❌ [用户 ${userId.slice(-3)}] 失败:`, body.error);
    return { status: response.status, error: body.error };
  } catch (error) {
    console.error(`❌ [用户 ${userId.slice(-3)}] 网络错误:`, error.message);
    return { status: -1, error: error.message };
  }
}

async function testGlobalQueue() {
  console.log('🧪 开始测试全局队列功能...');
  console.log('📋 场景：5 个不同用户同时发送请求（触发全局限制）');
  console.log('---');

  const timestamp = Date.now();
  const userIds = Array.from({ length: 5 }, (_, i) => `test_user_${timestamp}_${i}`);

  console.log('\n【测试 1】5 个用户同时发送请求...');
  const promises = userIds.map((userId, i) => 
    sendChatRequest(userId, `测试消息 from 用户${i}`)
  );

  const results = await Promise.all(promises);
  
  console.log('\n📊 结果汇总:');
  const queuedRequests = results.filter(r => r.status === 429);
  const successRequests = results.filter(r => r.status === 200);
  
  console.log(`   ✅ 成功: ${successRequests.length} 个`);
  console.log(`   🎫 排队: ${queuedRequests.length} 个`);
  
  if (queuedRequests.length > 0) {
    console.log(`\n   排队详情:`);
    queuedRequests.forEach((r, i) => {
      console.log(`   ${i + 1}. Position: ${r.queuePosition}, Retry-After: ${r.retryAfter}s, Reason: ${r.reason?.slice(0, 30)}...`);
    });
    
    // 检查是否是全局队列（而非单用户限制）
    const isGlobalQueue = queuedRequests.some(r => r.reason?.includes('服务端繁忙'));
    if (isGlobalQueue) {
      console.log(`\n   ✅ 触发了全局队列！`);
    } else {
      console.log(`\n   ℹ️ 触发的是单用户限制（可能并发配置较高）`);
    }

    // 测试 2：携带 token 重试第一个排队的请求
    const firstQueued = queuedRequests[0];
    if (firstQueued && firstQueued.queueToken) {
      console.log(`\n【测试 2】携带 token 重试第一个排队请求...`);
      console.log(`   等待 ${firstQueued.retryAfter} 秒...`);
      
      await new Promise((resolve) => setTimeout(resolve, firstQueued.retryAfter * 1000));
      
      const retryResult = await sendChatRequest(
        userIds[results.indexOf(firstQueued)], 
        '重试消息', 
        firstQueued.queueToken
      );
      
      console.log(`\n📊 重试结果:`);
      console.log(`   Status: ${retryResult.status}`);
      if (retryResult.status === 429) {
        console.log(`   Position: ${retryResult.queuePosition} (原位置: ${firstQueued.queuePosition})`);
        console.log(`   ℹ️ 仍在排队，位置${retryResult.queuePosition < firstQueued.queuePosition ? '前进了' : '未变化'}`);
      } else if (retryResult.status === 200) {
        console.log(`   ✅ 成功获得并发名额！`);
      }
    }
  } else {
    console.log(`\n   ℹ️ 所有请求都成功了（没有触发并发限制）`);
    console.log(`   提示：可以降低 MAX_SSE_CONNECTIONS 环境变量来测试队列`);
  }

  console.log('\n✅ 测试完成！');
}

// 运行测试
testGlobalQueue().catch(console.error);

