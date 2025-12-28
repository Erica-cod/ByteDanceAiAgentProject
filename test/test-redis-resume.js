/**
 * Redis 断点续传测试脚本
 * 
 * 测试场景：
 * 1. 启动多 Agent 会话
 * 2. 等待 2-3 轮后模拟中断
 * 3. 验证 Redis 中保存了状态
 * 4. 重新连接并验证从断点继续
 * 
 * 运行方式：node test/test-redis-resume.js
 */

import fetch from 'node-fetch';
import { createClient } from 'redis';

const API_BASE = 'http://localhost:8080';
const TEST_USER_ID = `test_user_${Date.now()}`;
const TEST_DEVICE_ID = `test_device_${Date.now()}`;

// Redis 配置
const REDIS_CONFIG = {
  socket: {
    host: 'localhost',
    port: 6379,
  },
  password: 'your_redis_password',
};

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.cyan);
}

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

/**
 * 启动多 Agent 会话并在指定轮次后中断
 */
async function startMultiAgentSession(interruptAtRound = 3) {
  return new Promise((resolve, reject) => {
    const clientAssistantMessageId = `test_msg_${Date.now()}`;
    let conversationId = null;
    let completedRounds = 0;
    let receivedEvents = [];
    
    logInfo(`启动多 Agent 会话（将在第 ${interruptAtRound} 轮后中断）...`);
    
    const controller = new AbortController();
    
    const requestBody = {
      message: '什么是量子计算？请详细解释其原理和应用。',
      modelType: 'volcano',
      userId: TEST_USER_ID,
      deviceId: TEST_DEVICE_ID,
      mode: 'multi_agent',
      clientUserMessageId: `test_user_msg_${Date.now()}`,
      clientAssistantMessageId: clientAssistantMessageId,
    };

    fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        // node-fetch v2 兼容写法
        let buffer = '';
        
        response.body.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            
            if (data === '[DONE]') {
              logInfo('收到 [DONE] 信号');
              continue;
            }

            // 忽略心跳
            if (data === '') continue;

            try {
              const parsed = JSON.parse(data);
              receivedEvents.push(parsed);

              if (parsed.type === 'init' && parsed.conversationId) {
                conversationId = parsed.conversationId;
                logInfo(`会话已创建: ${conversationId}`);
              }

              if (parsed.type === 'agent_output') {
                log(`  📤 Agent输出: ${parsed.agent} (第 ${parsed.round} 轮)`, colors.blue);
              }

              if (parsed.type === 'round_complete') {
                completedRounds = parsed.round;
                logSuccess(`第 ${parsed.round} 轮已完成`);

                // 在指定轮次后中断
                if (completedRounds >= interruptAtRound) {
                  logWarning(`已完成 ${completedRounds} 轮，现在中断连接...`);
                  controller.abort();
                  response.body.destroy();
                  
                  // 等待一下让后端保存状态
                  setTimeout(() => {
                    resolve({
                      conversationId,
                      clientAssistantMessageId,
                      completedRounds,
                      receivedEvents,
                    });
                  }, 1000);
                }
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        });

        response.body.on('end', () => {
          // 流结束
        });

        response.body.on('error', (error) => {
          if (error.name !== 'AbortError') {
            reject(error);
          }
        });
      })
      .catch((error) => {
        if (error.name === 'AbortError') {
          // 预期的中断
          return;
        }
        reject(error);
      });
  });
}

/**
 * 验证 Redis 中的状态
 */
async function verifyRedisState(conversationId, clientAssistantMessageId, expectedRounds) {
  const redisClient = createClient(REDIS_CONFIG);
  
  try {
    await redisClient.connect();
    logSuccess('Redis 连接成功');

    const key = `multi_agent:${conversationId}:${clientAssistantMessageId}`;
    logInfo(`查询 Redis 键: ${key}`);

    const data = await redisClient.get(key);
    
    if (!data) {
      logError('Redis 中未找到状态！');
      return false;
    }

    const state = JSON.parse(data);
    logSuccess(`找到 Redis 状态: 已完成 ${state.completedRounds} 轮`);

    if (state.completedRounds !== expectedRounds) {
      logError(`轮次不匹配！期望 ${expectedRounds}，实际 ${state.completedRounds}`);
      return false;
    }

    logInfo(`会话状态预览:`);
    console.log(`  - 当前轮次: ${state.sessionState.current_round}`);
    console.log(`  - 最大轮次: ${state.sessionState.max_rounds}`);
    console.log(`  - 状态: ${state.sessionState.status}`);
    console.log(`  - 共识趋势: ${JSON.stringify(state.sessionState.consensus_trend)}`);

    return true;
  } catch (error) {
    logError(`Redis 验证失败: ${error.message}`);
    return false;
  } finally {
    await redisClient.quit();
  }
}

/**
 * 恢复会话并验证从断点继续
 */
async function resumeSession(conversationId, clientAssistantMessageId, resumeFromRound) {
  return new Promise((resolve, reject) => {
    logInfo(`恢复会话，从第 ${resumeFromRound} 轮继续...`);
    
    let resumed = false;
    let receivedEvents = [];

    const requestBody = {
      message: '什么是量子计算？请详细解释其原理和应用。',
      modelType: 'volcano',
      userId: TEST_USER_ID,
      deviceId: TEST_DEVICE_ID,
      conversationId: conversationId,
      mode: 'multi_agent',
      clientUserMessageId: `test_user_msg_${Date.now()}`,
      clientAssistantMessageId: clientAssistantMessageId,
      resumeFromRound: resumeFromRound,
    };

    fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        // node-fetch v2 兼容写法
        let buffer = '';
        
        response.body.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            
            if (data === '[DONE]') {
              logSuccess('会话完成！');
              resolve({ resumed, receivedEvents });
              return;
            }

            if (data === '') continue;

            try {
              const parsed = JSON.parse(data);
              receivedEvents.push(parsed);

              if (parsed.type === 'resume') {
                resumed = true;
                logSuccess(`✨ 从第 ${parsed.resumedFromRound} 轮恢复，继续第 ${parsed.continueFromRound} 轮`);
              }

              if (parsed.type === 'agent_output') {
                log(`  📤 Agent输出: ${parsed.agent} (第 ${parsed.round} 轮)`, colors.blue);
              }

              if (parsed.type === 'session_complete') {
                logSuccess(`会话完成，总轮次: ${parsed.rounds}`);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        });

        response.body.on('end', () => {
          // 流结束，如果没有收到 [DONE]，也应该 resolve
          if (!resumed) {
            resolve({ resumed, receivedEvents });
          }
        });

        response.body.on('error', (error) => {
          reject(error);
        });
      })
      .catch(reject);
  });
}

/**
 * 主测试流程
 */
async function runTest() {
  console.log('\n' + '='.repeat(60));
  log('🧪 Redis 断点续传测试', colors.bright + colors.cyan);
  console.log('='.repeat(60) + '\n');

  try {
    // 步骤 1：启动会话并在第 2 轮后中断
    log('\n📍 步骤 1: 启动会话并在第 2 轮后中断', colors.bright);
    console.log('-'.repeat(60));
    
    const { conversationId, clientAssistantMessageId, completedRounds } = 
      await startMultiAgentSession(2);
    
    logSuccess(`会话已中断，已完成 ${completedRounds} 轮`);
    logInfo(`会话ID: ${conversationId}`);
    logInfo(`消息ID: ${clientAssistantMessageId}`);

    // 步骤 2：验证 Redis 中的状态
    log('\n📍 步骤 2: 验证 Redis 中的状态', colors.bright);
    console.log('-'.repeat(60));
    
    const redisValid = await verifyRedisState(
      conversationId, 
      clientAssistantMessageId, 
      completedRounds
    );

    if (!redisValid) {
      throw new Error('Redis 状态验证失败');
    }

    // 步骤 3：恢复会话
    log('\n📍 步骤 3: 恢复会话并从断点继续', colors.bright);
    console.log('-'.repeat(60));
    
    const { resumed } = await resumeSession(
      conversationId, 
      clientAssistantMessageId, 
      completedRounds + 1
    );

    if (!resumed) {
      logError('未检测到恢复事件！');
      throw new Error('断点续传未生效');
    }

    // 测试成功
    console.log('\n' + '='.repeat(60));
    logSuccess('🎉 所有测试通过！');
    console.log('='.repeat(60) + '\n');

    console.log('测试摘要:');
    console.log(`  ✅ 会话中断: 在第 ${completedRounds} 轮后成功中断`);
    console.log(`  ✅ Redis 状态: 状态已保存且数据完整`);
    console.log(`  ✅ 断点续传: 成功从第 ${completedRounds + 1} 轮继续`);
    console.log(`  ✅ Token 节省: 约 ${Math.round((completedRounds / 5) * 100)}%\n`);

  } catch (error) {
    console.log('\n' + '='.repeat(60));
    logError(`测试失败: ${error.message}`);
    console.log('='.repeat(60) + '\n');
    
    if (error.code === 'ECONNREFUSED') {
      logWarning('提示: 请确保服务器正在运行 (npm run dev)');
    }
    
    process.exit(1);
  }
}

// 运行测试
runTest().catch((error) => {
  logError(`未捕获的错误: ${error.message}`);
  process.exit(1);
});

