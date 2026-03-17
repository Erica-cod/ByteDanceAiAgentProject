/**
 * 旧系统兼容适配器
 * 
 * 作用：让旧的 tool executor 无缝切换到新的工具系统
 * 保证现有代码无需修改即可使用新的限流、缓存、熔断等功能
 */

import { toolExecutor } from '../core/execution/tool-executor.js';
export interface ToolExecutionResult {
  resultText: string;
  sources?: Array<{ title: string; url: string }>;
}
import type { ToolContext } from '../core/types.js';
import '../protocols/builtins.js';
import { toolCallProtocolRegistry } from '../protocols/protocol-registry.js';

/**
 * 兼容旧的 executeToolCall 接口
 * 
 * 用法：
 * ```typescript
 * // 旧代码：
 * import { executeToolCall } from './tools/toolExecutor.js';
 * 
 * // 新代码（只需修改导入）：
 * import { executeToolCall } from './tools/adapters/legacy-adapter.js';
 * ```
 */
export async function executeToolCall(
  toolCall: any,
  userId: string
): Promise<ToolExecutionResult> {
  console.log('🔄 [LegacyAdapter] 使用新工具系统处理旧格式的工具调用');

  // 1. 解析工具调用（通过可插拔协议）
  const protocol = toolCallProtocolRegistry.detect(toolCall);
  if (!protocol) {
    console.warn('⚠️  [LegacyAdapter] 未匹配到协议，使用兜底解析');
  }

  const normalized = protocol?.parse(toolCall) ?? fallbackParse(toolCall);

  // 2. 构建新的执行上下文
  const context: ToolContext = {
    userId,
    requestId: `legacy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
  };

  // 3. 参数（协议已标准化）
  const params = normalized.params ?? {};

  // 4. 执行工具
  const result = await toolExecutor.execute(normalized.toolName, params, context);

  // 5. 转换为旧格式的返回值
  if (protocol?.formatToTextResult) {
    return protocol.formatToTextResult(result, context);
  }

  return convertToLegacyFormat(result);
}

/**
 * 兜底解析（尽量向后兼容）
 */
function fallbackParse(toolCall: any): { toolName: string; params: any } {
  // 格式 1：{ tool, query, options }
  if (toolCall.tool && typeof toolCall.tool === 'string') {
    return {
      toolName: toolCall.tool,
      params: {
        ...(toolCall.query ? { query: toolCall.query } : {}),
        ...(toolCall.options || {}),
      },
    };
  }

  // 格式 2：{ function: { name, arguments } } (OpenAI Format)
  if (toolCall.function && toolCall.function.name) {
    const args = typeof toolCall.function.arguments === 'string'
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

    return {
      toolName: toolCall.function.name,
      params: args,
    };
  }

  // 格式 2.1：{ name, args }（常见于 <tool_call> JSON）
  if (toolCall.name && toolCall.args) {
    return {
      toolName: String(toolCall.name),
      params: toolCall.args || {},
    };
  }

  // 格式 3：直接就是工具名
  if (typeof toolCall === 'string') {
    return {
      toolName: toolCall,
      params: {},
    };
  }

  // 默认格式
  return {
    toolName: toolCall.tool || 'unknown',
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

