/**
 * LangGraph 工作流 - 多工具协作系统
 * 
 * 功能：
 * - 支持多轮工具调用
 * - 自动决策下一步操作
 * - 状态管理和追踪
 */

import { StateGraph, END, Annotation } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { validateToolCall } from '../tools/toolValidator.js';
import { searchWeb } from '../tools/tavilySearch.js';
import { routePlanningTool } from '../tools/planningTools.js';
import { extractToolCall } from '../utils/jsonExtractor.js';

/**
 * Agent 状态定义 - 使用 Annotation
 */
const AgentStateAnnotation = Annotation.Root({
  // 消息历史 (用于 AI 模型)
  messages: Annotation<BaseMessage[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  
  // 最后一次 AI 回复的完整文本
  lastAIResponse: Annotation<string>({
    reducer: (_, right) => right,
    default: () => '',
  }),
  
  // 工具执行结果
  toolResults: Annotation<Array<{
    tool: string;
    params: any;
    result: any;
    timestamp: Date;
  }>>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  
  // 迭代计数
  iterations: Annotation<number>({
    reducer: (_, right) => right,
    default: () => 0,
  }),
  
  // 用户ID
  userId: Annotation<string>({
    reducer: (_, right) => right,
    default: () => '',
  }),
  
  // 模型类型
  modelType: Annotation<'local' | 'volcano'>({
    reducer: (_, right) => right,
    default: () => 'volcano',
  }),
  
  // 是否需要继续
  needsContinue: Annotation<boolean>({
    reducer: (_, right) => right,
    default: () => true,
  }),
  
  // 错误信息
  error: Annotation<string | undefined>({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
});

export type AgentState = typeof AgentStateAnnotation.State;

// ✅ 工具调用提取已迁移到 api/utils/jsonExtractor.ts
// 直接使用导入的 extractToolCall 函数

/**
 * 工具执行节点
 * 
 * 从 lastAIResponse 中提取工具调用并执行
 */
async function toolExecutorNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`\n🔧 [ToolExecutor] 开始执行，迭代: ${state.iterations + 1}`);
  
  const { lastAIResponse, userId, iterations } = state;
  
  if (!lastAIResponse) {
    console.log('⚠️  [ToolExecutor] 没有 AI 回复');
    return {
      needsContinue: false,
    };
  }
  
  // 提取工具调用
  const toolCall = extractToolCall(lastAIResponse);
  
  if (!toolCall) {
    console.log('✅ [ToolExecutor] 没有检测到工具调用，结束工作流');
    return {
      needsContinue: false,
    };
  }
  
  console.log('🔍 [ToolExecutor] 检测到工具调用:', toolCall.tool);
  
  try {
    // 验证工具调用
    const validation = validateToolCall(toolCall);
    
    if (!validation.valid) {
      console.error('❌ [ToolExecutor] 工具验证失败:', validation.error);
      return {
        error: `工具验证失败: ${validation.error}`,
        needsContinue: false,
      };
    }
    
    const normalizedToolCall = validation.normalizedToolCall!;
    const { tool } = normalizedToolCall;
    
    let result: any;
    
    // 执行对应的工具
    if (tool === 'search_web') {
      console.log(`🔍 [ToolExecutor] 执行搜索: ${normalizedToolCall.query}`);
      
      const searchResult = await searchWeb(normalizedToolCall.query, {
        maxResults: normalizedToolCall.maxResults || 5,
        searchDepth: normalizedToolCall.searchDepth || 'advanced',
        includeAnswer: true,
      });
      
      // 格式化搜索结果
      const formattedResults = searchResult.results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.content}\n   来源: ${r.url}`)
        .join('\n\n');
      
      result = {
        success: true,
        data: {
          answer: searchResult.answer,
          results: formattedResults,
          count: searchResult.results.length,
        },
        message: `找到 ${searchResult.results.length} 条搜索结果`,
      };
    } 
    else if (['create_plan', 'update_plan', 'get_plan', 'list_plans'].includes(tool)) {
      console.log(`📋 [ToolExecutor] 执行计划工具: ${tool}`);
      
      result = await routePlanningTool(tool, userId, normalizedToolCall);
    }
    else {
      console.warn(`⚠️  [ToolExecutor] 未知工具: ${tool}`);
      result = {
        success: false,
        error: `未知工具: ${tool}`,
      };
    }
    
    console.log(`✅ [ToolExecutor] 工具 ${tool} 执行完成`);
    
    // 将工具结果格式化为消息
    const resultContent = result.success
      ? `工具 "${tool}" 执行成功:\n${JSON.stringify(result.data || result, null, 2)}`
      : `工具 "${tool}" 执行失败: ${result.error}`;
    
    const resultMessage = new HumanMessage({ content: resultContent });
    
    return {
      messages: [
        new AIMessage({ content: lastAIResponse }),  // 保存 AI 的工具调用
        resultMessage,  // 工具执行结果
      ],
      toolResults: [{
        tool,
        params: normalizedToolCall,
        result,
        timestamp: new Date(),
      }],
      iterations: iterations + 1,
      lastAIResponse: '',  // 清空，等待下一次 AI 回复
      needsContinue: result.success,  // 成功则可能继续
    };
    
  } catch (error: any) {
    console.error('❌ [ToolExecutor] 执行失败:', error);
    
    return {
      error: `工具执行失败: ${error.message}`,
      needsContinue: false,
    };
  }
}

/**
 * AI 决策节点
 * 
 * 决定是否继续工作流
 */
function shouldContinue(state: AgentState): '__end__' | 'toolExecutor' {
  const { iterations, error, needsContinue } = state;
  
  console.log(`🤔 [Decision] 当前迭代: ${iterations}/5`);
  
  // 如果有错误，结束
  if (error) {
    console.log('❌ [Decision] 检测到错误，结束工作流');
    return '__end__';
  }
  
  // 检查最大迭代次数
  if (iterations >= 5) {
    console.log('⚠️  [Decision] 达到最大迭代次数，结束工作流');
    return '__end__';
  }
  
  // 检查是否需要继续（由 toolExecutor 设置）
  if (!needsContinue) {
    console.log('✅ [Decision] 无需继续，结束工作流');
    return '__end__';
  }
  
  console.log('🔄 [Decision] 继续执行工作流');
  return 'toolExecutor';
}

/**
 * 创建 Agent 工作流
 */
export function createAgentWorkflow() {
  // 使用 Annotation 创建状态图
  const workflow = new StateGraph(AgentStateAnnotation);
  
  // 定义节点名称
  const TOOL_EXECUTOR = 'toolExecutor' as any;
  
  // 添加节点
  workflow.addNode(TOOL_EXECUTOR, toolExecutorNode);
  
  // 设置入口节点
  (workflow as any).setEntryPoint(TOOL_EXECUTOR);
  
  // 添加条件边 - toolExecutor 根据结果决定下一步
  (workflow as any).addConditionalEdges(
    TOOL_EXECUTOR,
    shouldContinue,
  );
  
  // 编译工作流
  const app = workflow.compile();
  
  console.log('✅ [Workflow] Agent 工作流创建完成');
  
  return app;
}

/**
 * 运行工作流
 */
export async function runAgentWorkflow(
  initialMessages: BaseMessage[],
  userId: string,
  onUpdate?: (state: AgentState) => void
): Promise<AgentState> {
  const app = createAgentWorkflow();
  
  const initialState = {
    messages: initialMessages,
    toolResults: [],
    iterations: 0,
    userId,
    currentToolCall: undefined,
    finalResponse: undefined,
    error: undefined,
  };
  
  console.log('🚀 [Workflow] 开始执行 Agent 工作流');
  
  let finalState: any = initialState;
  
  // 执行工作流
  const stream = await app.stream(initialState);
  
  for await (const output of stream) {
    // output 是一个对象，key 是节点名，value 是该节点的输出
    const nodeName = Object.keys(output)[0];
    const nodeOutput = (output as any)[nodeName];
    
    console.log(`📍 [Workflow] 节点 "${nodeName}" 输出:`, nodeOutput);
    
    // 更新状态
    finalState = { ...finalState, ...nodeOutput };
    
    // 调用回调
    if (onUpdate) {
      onUpdate(finalState);
    }
  }
  
  console.log('✅ [Workflow] 工作流执行完成');
  
  return finalState as AgentState;
}

