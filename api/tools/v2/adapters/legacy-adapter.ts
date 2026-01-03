/**
 * 旧系统兼容适配器
 * 
 * 作用：让旧的 tool executor 无缝切换到新的工具系统
 * 保证现有代码无需修改即可使用新的限流、缓存、熔断等功能
 */

import { toolExecutor } from '../core/tool-executor.js';
import type { ToolExecutionResult } from '../../toolExecutor.js';
import type { ToolContext } from '../core/types.js';

/**
 * 兼容旧的 executeToolCall 接口
 * 
 * 用法：
 * ```typescript
 * // 旧代码：
 * import { executeToolCall } from './tools/toolExecutor.js';
 * 
 * // 新代码（只需修改导入）：
 * import { executeToolCall } from './tools/v2/adapters/legacy-adapter.js';
 * ```
 */
export async function executeToolCall(
  toolCall: any,
  userId: string
): Promise<ToolExecutionResult> {
  console.log('🔄 [LegacyAdapter] 使用新工具系统处理旧格式的工具调用');

  // 1. 解析工具调用（兼容旧格式）
  const { tool, query, params, options } = normalizeToolCall(toolCall);

  // 2. 构建新的执行上下文
  const context: ToolContext = {
    userId,
    requestId: `legacy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
  };

  // 3. 合并参数
  const mergedParams = {
    ...params,
    ...(query ? { query } : {}),
    ...(options || {}),
  };

  // 4. 执行工具
  const result = await toolExecutor.execute(tool, mergedParams, context);

  // 5. 转换为旧格式的返回值
  return convertToLegacyFormat(result);
}

/**
 * 标准化工具调用（支持多种旧格式）
 */
function normalizeToolCall(toolCall: any): {
  tool: string;
  query?: string;
  params: any;
  options?: any;
} {
  // 格式 1：{ tool, query, options }
  if (toolCall.tool && typeof toolCall.tool === 'string') {
    return {
      tool: toolCall.tool,
      query: toolCall.query,
      params: {},
      options: toolCall.options,
    };
  }

  // 格式 2：{ function: { name, arguments } } (OpenAI Format)
  if (toolCall.function && toolCall.function.name) {
    const args = typeof toolCall.function.arguments === 'string'
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

    return {
      tool: toolCall.function.name,
      params: args,
    };
  }

  // 格式 3：直接就是工具名
  if (typeof toolCall === 'string') {
    return {
      tool: toolCall,
      params: {},
    };
  }

  // 默认格式
  return {
    tool: toolCall.tool || 'unknown',
    params: toolCall,
  };
}

/**
 * 转换为旧格式的返回值
 */
function convertToLegacyFormat(result: any): ToolExecutionResult {
  if (result.success) {
    // 成功情况
    let resultText = '';

    if (result.data) {
      // 搜索工具返回格式
      if (result.data.results && result.data.answer) {
        resultText = `<search_results>\nAI 摘要：\n${result.data.answer}\n\n${result.data.results}\n</search_results>`;
      }
      // 计划工具返回格式
      else if (result.message) {
        resultText = `<tool_result>\n${result.message}\n\n详细数据:\n${JSON.stringify(result.data, null, 2)}\n</tool_result>`;
      }
      // 通用格式
      else {
        resultText = `<tool_result>\n${JSON.stringify(result.data, null, 2)}\n</tool_result>`;
      }
    } else {
      resultText = `<tool_result>\n${result.message || '执行成功'}\n</tool_result>`;
    }

    return {
      resultText,
      sources: result.sources || [],
    };
  } else {
    // 失败情况
    return {
      resultText: `<tool_error>${result.error || '工具执行失败'}</tool_error>`,
      sources: [],
    };
  }
}

/**
 * 获取工具系统状态（用于监控）
 */
export function getToolSystemStatus() {
  return toolExecutor.getAllMetrics();
}

