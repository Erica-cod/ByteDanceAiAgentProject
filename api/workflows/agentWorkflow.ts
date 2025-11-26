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

/**
 * Agent 状态定义 - 使用 Annotation
 */
const AgentStateAnnotation = Annotation.Root({
  // 消息历史
  messages: Annotation<BaseMessage[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  
  // 当前工具调用
  currentToolCall: Annotation<any>({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
  
  // 工具执行结果
  toolResults: Annotation<Array<{
    tool: string;
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
  
  // 最终回复
  finalResponse: Annotation<string | undefined>({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
  
  // 错误信息
  error: Annotation<string | undefined>({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
});

export type AgentState = typeof AgentStateAnnotation.State;

/**
 * 工具执行节点
 * 
 * 接收 AI 的工具调用，执行工具，返回结果
 */
async function toolExecutorNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log('🔧 [ToolExecutor] 开始执行工具...');
  
  const { currentToolCall, userId, toolResults } = state;
  
  if (!currentToolCall) {
    console.log('⚠️  [ToolExecutor] 没有待执行的工具调用');
    return {};
  }
  
  try {
    // 验证工具调用
    const validation = validateToolCall(currentToolCall);
    
    if (!validation.valid) {
      console.error('❌ [ToolExecutor] 工具验证失败:', validation.error);
      return {
        error: `工具验证失败: ${validation.error}`,
        currentToolCall: undefined,
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
      
      result = {
        success: true,
        data: searchResult,
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
    
    // 记录工具执行结果
    const newToolResults = [
      ...toolResults,
      {
        tool,
        result,
        timestamp: new Date(),
      },
    ];
    
    console.log(`✅ [ToolExecutor] 工具 ${tool} 执行完成`);
    
    // 将工具结果添加到消息历史
    const resultMessage = new HumanMessage({
      content: `工具 "${tool}" 执行结果:\n${JSON.stringify(result, null, 2)}`,
    });
    
    return {
      messages: [...state.messages, resultMessage],
      toolResults: newToolResults,
      currentToolCall: undefined,
    };
    
  } catch (error: any) {
    console.error('❌ [ToolExecutor] 执行失败:', error);
    
    return {
      error: `工具执行失败: ${error.message}`,
      currentToolCall: undefined,
    };
  }
}

/**
 * AI 决策节点
 * 
 * 决定是否继续调用工具，还是给出最终回复
 */
function shouldContinue(state: AgentState): '__end__' | 'toolExecutor' {
  const { iterations, error, messages } = state;
  
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
  
  // 检查最后一条消息是否包含工具调用
  const lastMessage = messages[messages.length - 1];
  
  if (lastMessage && lastMessage.content) {
    const content = lastMessage.content.toString();
    
    // 简单检测是否包含 tool_call 或 "tool": 
    if (content.includes('<tool_call>') || (content.includes('"tool"') && content.includes('{'))) {
      console.log('🔧 [Decision] 检测到工具调用，继续执行');
      return 'toolExecutor';
    }
  }
  
  console.log('✅ [Decision] 没有更多工具调用，结束工作流');
  return '__end__';
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
    const nodeOutput = output[nodeName];
    
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

