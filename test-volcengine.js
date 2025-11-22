/**
 * 火山引擎 API 测试脚本
 * 用于验证火山引擎 API 配置是否正确
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';

// 加载环境变量
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.production' });

const ARK_API_KEY = process.env.ARK_API_KEY;
const ARK_API_URL = process.env.ARK_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const ARK_MODEL = process.env.ARK_MODEL || 'doubao-1-5-thinking-pro-250415';

console.log('='.repeat(60));
console.log('🧪 火山引擎 API 测试');
console.log('='.repeat(60));
console.log('');
console.log('📋 配置信息:');
console.log('  API URL:', ARK_API_URL);
console.log('  Model:', ARK_MODEL);
console.log('  API Key:', ARK_API_KEY ? `${ARK_API_KEY.substring(0, 10)}...` : '❌ 未配置');
console.log('');

if (!ARK_API_KEY) {
  console.error('❌ 错误: ARK_API_KEY 未配置');
  console.log('');
  console.log('请在 .env.local 或 .env.production 文件中设置:');
  console.log('  ARK_API_KEY=your_actual_api_key_here');
  console.log('');
  process.exit(1);
}

async function testVolcengineAPI() {
  console.log('📡 发送测试请求到火山引擎...');
  console.log('');
  
  const requestBody = {
    model: ARK_MODEL,
    messages: [
      { role: 'system', content: '你是一个有帮助的AI助手。' },
      { role: 'user', content: '你好，请简短地介绍一下你自己。' }
    ],
    stream: true,
    temperature: 0.7,
    max_tokens: 200,
  };

  try {
    const response = await fetch(ARK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ARK_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    console.log('📥 响应状态:', response.status, response.statusText);
    console.log('');

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API 请求失败:');
      console.error('  状态码:', response.status);
      console.error('  错误信息:', errorText);
      console.log('');
      process.exit(1);
    }

    console.log('✅ API 连接成功！');
    console.log('');
    console.log('🤖 AI 回复内容:');
    console.log('-'.repeat(60));

    let fullContent = '';
    const reader = response.body;
    
    for await (const chunk of reader) {
      const chunkStr = chunk.toString();
      const lines = chunkStr.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          
          if (data === '[DONE]') {
            console.log('');
            console.log('-'.repeat(60));
            console.log('');
            console.log('✅ 测试完成！火山引擎 API 工作正常。');
            return;
          }

          try {
            const json = JSON.parse(data);
            if (json.choices && json.choices[0]?.delta?.content) {
              const content = json.choices[0].delta.content;
              fullContent += content;
              process.stdout.write(content);
            }
          } catch (error) {
            // 忽略解析错误
          }
        }
      }
    }

  } catch (error) {
    console.error('');
    console.error('❌ 测试失败:', error.message);
    console.log('');
    console.log('可能的原因:');
    console.log('  1. 网络连接问题');
    console.log('  2. API Key 无效');
    console.log('  3. API URL 配置错误');
    console.log('  4. 防火墙或代理问题');
    console.log('');
    process.exit(1);
  }
}

// 运行测试
testVolcengineAPI();

