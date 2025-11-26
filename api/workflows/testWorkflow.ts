/**
 * LangGraph 工作流测试文件
 * 
 * 运行方式: node --loader ts-node/esm api/workflows/testWorkflow.ts
 */

import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { runAgentWorkflow } from './agentWorkflow.js';

async function testSimpleToolCall() {
  console.log('\n🧪 测试 1: 简单工具调用 (search_web)');
  console.log('=' .repeat(60));
  
  const messages = [
    new HumanMessage({ content: '用户: 搜索最新的 AI 新闻' }),
    new AIMessage({ content: '<tool_call>{"tool": "search_web", "query": "2025年最新AI新闻"}</tool_call>' }),
  ];
  
  const result = await runAgentWorkflow(messages, 'test-user-1');
  
  console.log('\n📊 工作流执行结果:');
  console.log('- 消息数量:', result.messages.length);
  console.log('- 工具调用次数:', result.toolResults.length);
  console.log('- 迭代次数:', result.iterations);
  console.log('- 是否有错误:', result.error || '无');
}

async function testMultipleToolCalls() {
  console.log('\n🧪 测试 2: 多轮工具调用 (search → create_plan)');
  console.log('=' .repeat(60));
  
  const messages = [
    new HumanMessage({ content: '用户: 帮我创建一个 IELTS 备考计划' }),
    new AIMessage({ content: '<tool_call>{"tool": "search_web", "query": "IELTS备考策略"}</tool_call>' }),
  ];
  
  const result = await runAgentWorkflow(messages, 'test-user-2');
  
  console.log('\n📊 工作流执行结果:');
  console.log('- 消息数量:', result.messages.length);
  console.log('- 工具调用次数:', result.toolResults.length);
  console.log('- 迭代次数:', result.iterations);
  
  if (result.toolResults.length > 0) {
    console.log('\n📋 工具调用历史:');
    result.toolResults.forEach((tr, index) => {
      console.log(`  ${index + 1}. ${tr.tool} (${tr.timestamp.toLocaleTimeString()})`);
    });
  }
}

async function testPlanningTools() {
  console.log('\n🧪 测试 3: 计划管理工具');
  console.log('=' .repeat(60));
  
  const messages = [
    new HumanMessage({ content: '用户: 创建一个学习计划' }),
    new AIMessage({ 
      content: `<tool_call>{
        "tool": "create_plan",
        "title": "30天编程学习计划",
        "goal": "掌握 TypeScript 和 React",
        "tasks": [
          {
            "title": "学习 TypeScript 基础",
            "estimated_hours": 20,
            "deadline": "2025-12-15",
            "tags": ["typescript"]
          },
          {
            "title": "构建第一个 React 应用",
            "estimated_hours": 30,
            "deadline": "2025-12-30",
            "tags": ["react"]
          }
        ]
      }</tool_call>`
    }),
  ];
  
  const result = await runAgentWorkflow(messages, 'test-user-3');
  
  console.log('\n📊 工作流执行结果:');
  console.log('- 工具调用成功:', result.toolResults.length > 0);
  
  if (result.toolResults.length > 0) {
    const planResult = result.toolResults[0].result;
    if (planResult.success) {
      console.log('✅ 计划创建成功!');
      console.log('  Plan ID:', planResult.data?.plan_id || 'N/A');
    } else {
      console.log('❌ 计划创建失败:', planResult.error);
    }
  }
}

// 运行所有测试
async function runAllTests() {
  try {
    await testSimpleToolCall();
    await new Promise(resolve => setTimeout(resolve, 2000)); // 延迟2秒
    
    await testMultipleToolCalls();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await testPlanningTools();
    
    console.log('\n✅ 所有测试完成!');
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    throw error;
  }
}

// 执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(console.error);
}

export { runAllTests };

