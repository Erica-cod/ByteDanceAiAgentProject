/**
 * 压力测试：触发全局队列
 * 
 * 策略：启动 10 个并发请求 + 在请求中模拟慢响应（让第一批不释放名额）
 */

const SERVER_URL = 'http://localhost:8080';

// 模拟慢速消费（不立即读取响应）
async function sendSlowRequest(userId, message) {
  const requestBody = {
    message,
    modelType: 'local',
    userId,
    mode: 'single',
    clientUserMessageId: `msg_${Date.now()}_${Math.random()}`,
    clientAssistantMessageId: `asst_${Date.now()}_${Math.random()}`,
  };

  console.log(`📤 [${userId.slice(-6)}] 发送请求...`);

  try {
    const response = await fetch(`${SERVER_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const status = response.status;
    
    if (status === 429) {
      const queueToken = response.headers.get('X-Queue-Token');
      const queuePosition = response.headers.get('X-Queue-Position');
      const retryAfter = response.headers.get('Retry-After');
      const body = await response.json();
      
      console.log(`🎫 [${userId.slice(-6)}] 排队! Position=${queuePosition}, Retry=${retryAfter}s`);
      console.log(`   Reason: ${body.error?.slice(0, 40)}...`);
      
      return { 
        userId, 
        status: 429, 
        queuePosition: parseInt(queuePosition || '0', 10),
        queueToken,
        retryAfter: parseInt(retryAfter || '1', 10) 
      };
    }
    
    if (status === 200) {
      console.log(`✅ [${userId.slice(-6)}] 成功进入（不读取响应，占用名额）`);
      // 不读取响应，保持连接占用名额
      return { userId, status: 200, connection: response };
    }

    console.log(`❌ [${userId.slice(-6)}] 失败: ${status}`);
    return { userId, status };
  } catch (error) {
    console.error(`❌ [${userId.slice(-6)}] 错误:`, error.message);
    return { userId, status: -1 };
  }
}

async function stressTest() {
  console.log('🔥 压力测试：触发全局队列');
  console.log('📋 策略：快速发送 10 个请求，前几个不释放名额');
  console.log('---\n');

  const timestamp = Date.now();
  const userIds = Array.from({ length: 10 }, (_, i) => `stress_${timestamp}_${i}`);

  console.log('【阶段 1】快速发送 10 个请求...\n');
  
  // 快速发送，不等待完成
  const promises = userIds.map(userId => 
    sendSlowRequest(userId, '测试消息（长时间占用）')
  );

  const results = await Promise.all(promises);
  
  console.log('\n📊 结果汇总:');
  const success = results.filter(r => r.status === 200);
  const queued = results.filter(r => r.status === 429);
  
  console.log(`   ✅ 成功占用名额: ${success.length} 个`);
  console.log(`   🎫 进入队列: ${queued.length} 个`);
  
  if (queued.length > 0) {
    console.log(`\n   ✅ 成功触发全局队列！`);
    console.log(`\n   队列详情:`);
    queued.forEach(r => {
      console.log(`      - 用户 ${r.userId.slice(-6)}: 位置=${r.queuePosition}, 等待=${r.retryAfter}s, Token=${r.queueToken?.slice(0, 20)}...`);
    });

    // 测试 token 重用
    const firstQueued = queued[0];
    if (firstQueued) {
      console.log(`\n【阶段 2】测试 token 重用（携带 token 重试）...`);
      console.log(`   等待 ${firstQueued.retryAfter} 秒...`);
      
      await new Promise(resolve => setTimeout(resolve, firstQueued.retryAfter * 1000));
      
      const retryBody = {
        message: '重试消息',
        modelType: 'local',
        userId: firstQueued.userId,
        mode: 'single',
        clientUserMessageId: `msg_retry_${Date.now()}`,
        clientAssistantMessageId: `asst_retry_${Date.now()}`,
        queueToken: firstQueued.queueToken,  // 携带 token
      };

      console.log(`\n📤 [${firstQueued.userId.slice(-6)}] 携带 token 重试: ${firstQueued.queueToken.slice(0, 20)}...`);
      
      const retryResponse = await fetch(`${SERVER_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(retryBody),
      });

      if (retryResponse.status === 429) {
        const newPosition = retryResponse.headers.get('X-Queue-Position');
        const newRetry = retryResponse.headers.get('Retry-After');
        console.log(`🎫 仍在排队: 位置=${newPosition} (原=${firstQueued.queuePosition}), Retry=${newRetry}s`);
        console.log(`   ${parseInt(newPosition) < firstQueued.queuePosition ? '✅ 位置前进了！' : 'ℹ️ 位置未变化（可能前面的还没释放）'}`);
      } else if (retryResponse.status === 200) {
        console.log(`✅ 成功获得名额！token 机制工作正常`);
      } else {
        console.log(`❓ 意外状态: ${retryResponse.status}`);
      }
    }
  } else {
    console.log(`\n   ℹ️ 未触发队列（并发限制配置: MAX_SSE_CONNECTIONS=${process.env.MAX_SSE_CONNECTIONS || '200'}）`);
    console.log(`   建议：在 .env 文件中设置 MAX_SSE_CONNECTIONS=3 来测试队列`);
  }

  console.log('\n✅ 测试完成！');
}

stressTest().catch(console.error);

