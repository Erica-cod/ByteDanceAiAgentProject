/**
 * SSE流式处理器（重构版）
 * 处理单Agent模式的SSE流式响应（本地模型和火山引擎模型）
 * 
 * 架构优化：
 * - SSE 流写入工具 → sseStreamWriter.ts (~80 行)
 * - 多工具调用工作流 → workflowProcessor.ts (~250 行)
 * - 火山引擎SSE处理 → sseVolcanoHandler.ts (~230 行)
 * - 本地模型SSE处理 → sseLocalHandler.ts (~260 行)
 */

// 重新导出优化后的函数
export { streamVolcengineToSSEResponse } from './sseVolcanoHandler.js';
export { streamToSSEResponse } from './sseLocalHandler.js';

