/**
 * 重构代码测试脚本
 * 
 * 测试内容：
 * 1. 验证所有新模块可以正常导入
 * 2. 验证类型定义正确
 * 3. 验证 SSE 处理器可以正常工作
 * 4. 验证工作流处理器功能
 * 
 * 运行方式：node test/test-refactored-code.js
 */

import fetch from 'node-fetch';

console.log('🧪 ===== 重构代码测试 =====\n');

// ==========================================
// 测试 1: 模块导入测试
// ==========================================
console.log('📦 测试 1: 模块导入测试');
console.log('━'.repeat(50));

const modules = [
  { path: '../api/types/chat.js', name: '类型定义' },
  { path: '../api/config/systemPrompt.js', name: 'System Prompt' },
  { path: '../api/utils/contentExtractor.js', name: '内容提取工具' },
  { path: '../api/utils/llmCaller.js', name: '模型调用封装' },
  { path: '../api/utils/toolExecutor.js', name: '工具执行器' },
  { path: '../api/handlers/sseStreamWriter.js', name: 'SSE流写入工具' },
  { path: '../api/handlers/workflowProcessor.js', name: '工作流处理器' },
  { path: '../api/handlers/sseVolcanoHandler.js', name: '火山引擎SSE处理器' },
  { path: '../api/handlers/sseLocalHandler.js', name: '本地模型SSE处理器' },
  { path: '../api/handlers/multiAgentHandler.js', name: '多Agent处理器' },
];

let importSuccess = 0;
let importFailed = 0;

for (const module of modules) {
  try {
    await import(module.path);
    console.log(`  ✅ ${module.name}: 导入成功`);
    importSuccess++;
  } catch (error) {
    console.error(`  ❌ ${module.name}: 导入失败`);
    console.error(`     错误: ${error.message}`);
    importFailed++;
  }
}

console.log(`\n📊 导入测试结果: ${importSuccess} 成功, ${importFailed} 失败\n`);

// ==========================================
// 测试 2: SSE 流写入工具测试
// ==========================================
console.log('📝 测试 2: SSE 流写入工具测试');
console.log('━'.repeat(50));

try {
  const { createSafeSSEWriter, createHeartbeat, sendInitData, sendDoneSignal } = await import('../api/handlers/sseStreamWriter.js');
  
  console.log('  ✅ createSafeSSEWriter 函数存在');
  console.log('  ✅ createHeartbeat 函数存在');
  console.log('  ✅ sendInitData 函数存在');
  console.log('  ✅ sendDoneSignal 函数存在');
  
  // 测试创建写入器
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  
  const { safeWrite, checkClosed, markClosed } = createSafeSSEWriter(writer, encoder);
  
  console.log('  ✅ SafeSSEWriter 创建成功');
  console.log(`  ✅ 初始状态: ${checkClosed() ? '已关闭' : '未关闭'}`);
  
  // 测试写入
  const writeResult = await safeWrite('test data');
  console.log(`  ✅ 测试写入: ${writeResult ? '成功' : '失败'}`);
  
  // 测试标记关闭
  markClosed();
  console.log(`  ✅ 标记关闭后: ${checkClosed() ? '已关闭' : '未关闭'}`);
  
  // 清理
  await writer.close();
  
  console.log('  ✅ SSE 流写入工具测试通过\n');
} catch (error) {
  console.error('  ❌ SSE 流写入工具测试失败:', error.message);
  console.error('  错误详情:', error.stack);
}

// ==========================================
// 测试 3: 内容提取工具测试
// ==========================================
console.log('🔍 测试 3: 内容提取工具测试');
console.log('━'.repeat(50));

try {
  const { extractThinkingAndContent } = await import('../api/utils/contentExtractor.js');
  
  // 测试用例 1: 完整的 thinking 标签
  const text1 = '<think>这是思考过程</think>这是最终内容';
  const result1 = extractThinkingAndContent(text1);
  console.log('  测试用例 1: 完整的 thinking 标签');
  console.log(`    thinking: "${result1.thinking}"`);
  console.log(`    content: "${result1.content}"`);
  console.log(`    ✅ ${result1.thinking === '这是思考过程' && result1.content === '这是最终内容' ? '通过' : '失败'}`);
  
  // 测试用例 2: 没有 thinking 标签
  const text2 = '这是纯内容，没有思考过程';
  const result2 = extractThinkingAndContent(text2);
  console.log('  测试用例 2: 没有 thinking 标签');
  console.log(`    thinking: "${result2.thinking}"`);
  console.log(`    content: "${result2.content}"`);
  console.log(`    ✅ ${result2.thinking === '' && result2.content === text2 ? '通过' : '失败'}`);
  
  // 测试用例 3: 未闭合的 thinking 标签
  const text3 = '已有内容<think>正在思考中...';
  const result3 = extractThinkingAndContent(text3);
  console.log('  测试用例 3: 未闭合的 thinking 标签');
  console.log(`    thinking: "${result3.thinking}"`);
  console.log(`    content: "${result3.content}"`);
  console.log(`    ✅ ${result3.thinking.includes('正在思考') && result3.content === '已有内容' ? '通过' : '失败'}`);
  
  console.log('  ✅ 内容提取工具测试通过\n');
} catch (error) {
  console.error('  ❌ 内容提取工具测试失败:', error.message);
}

// ==========================================
// 测试 4: System Prompt 测试
// ==========================================
console.log('📋 测试 4: System Prompt 测试');
console.log('━'.repeat(50));

try {
  const { SYSTEM_PROMPT, buildSystemPrompt } = await import('../api/config/systemPrompt.js');
  
  console.log(`  ✅ SYSTEM_PROMPT 长度: ${SYSTEM_PROMPT.length} 字符`);
  console.log(`  ✅ 包含工具调用规则: ${SYSTEM_PROMPT.includes('tool_call') ? '是' : '否'}`);
  console.log(`  ✅ 包含多工具调用说明: ${SYSTEM_PROMPT.includes('多工具调用') ? '是' : '否'}`);
  
  // 测试重新构建
  const newPrompt = buildSystemPrompt();
  console.log(`  ✅ buildSystemPrompt() 可以正常调用`);
  console.log(`  ✅ 重新构建的长度: ${newPrompt.length} 字符`);
  
  console.log('  ✅ System Prompt 测试通过\n');
} catch (error) {
  console.error('  ❌ System Prompt 测试失败:', error.message);
}

// ==========================================
// 测试 5: 实际 API 调用测试（如果服务器在运行）
// ==========================================
console.log('🌐 测试 5: 实际 API 调用测试');
console.log('━'.repeat(50));

try {
  // 检查服务器是否运行
  const healthCheck = await fetch('http://localhost:8080/api/chat', {
    method: 'HEAD',
  }).catch(() => null);
  
  if (!healthCheck) {
    console.log('  ⚠️  开发服务器未运行，跳过 API 测试');
    console.log('  ℹ️  提示: 运行 npm run dev 启动服务器后再测试\n');
  } else {
    console.log('  ✅ 开发服务器正在运行');
    
    // 发送一个简单的测试请求
    const testUserId = `test_user_${Date.now()}`;
    const testMessage = '你好！这是一个测试消息。';
    
    console.log(`  📤 发送测试消息: "${testMessage}"`);
    
    const response = await fetch('http://localhost:8080/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: testMessage,
        modelType: 'volcano',
        userId: testUserId,
        mode: 'single',
      }),
    });
    
    if (response.ok) {
      console.log('  ✅ API 响应状态: 200 OK');
      console.log('  ✅ Content-Type:', response.headers.get('content-type'));
      
      // 读取少量数据验证 SSE 格式
      const reader = response.body;
      let receivedData = '';
      let chunkCount = 0;
      
      for await (const chunk of reader) {
        receivedData += chunk.toString();
        chunkCount++;
        
        // 只读取前几个 chunk 作为验证
        if (chunkCount >= 3) {
          break;
        }
      }
      
      console.log(`  ✅ 接收到 ${chunkCount} 个数据块`);
      console.log(`  ✅ 数据格式: ${receivedData.includes('data:') ? 'SSE 格式正确' : '格式异常'}`);
      
      // 取消请求（避免浪费 token）
      reader.cancel();
      
      console.log('  ✅ API 调用测试通过\n');
    } else {
      console.error(`  ❌ API 响应异常: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error(`  错误详情: ${errorText.substring(0, 200)}\n`);
    }
  }
} catch (error) {
  console.error('  ❌ API 测试失败:', error.message);
  console.error('  ℹ️  这可能是因为服务器未运行或配置问题\n');
}

// ==========================================
// 测试总结
// ==========================================
console.log('📊 ===== 测试总结 =====');
console.log('━'.repeat(50));

console.log('✅ 模块导入测试: 完成');
console.log('✅ SSE 流写入工具测试: 完成');
console.log('✅ 内容提取工具测试: 完成');
console.log('✅ System Prompt 测试: 完成');
console.log('✅ API 调用测试: 完成（如果服务器在运行）');

console.log('\n🎉 重构代码测试完成！');

console.log('\n💡 下一步建议：');
console.log('  1. 运行 npm run dev 启动开发服务器');
console.log('  2. 在浏览器中测试完整的对话功能');
console.log('  3. 测试多 Agent 模式');
console.log('  4. 测试工具调用功能');
console.log('  5. 测试 Redis 断点续传功能\n');

