/**
 * Chunking 模式事件处理器
 * 处理超长文本的分段智能处理
 */

import type { StreamState } from './types';

/**
 * 处理 chunking_init 事件
 */
export function handleChunkingInit(
  parsed: any,
  state: StreamState,
  updateMessage: (id: string, updates: any) => void,
  assistantMessageId: string
): void {
  state.chunkingTotalChunks = parsed.totalChunks || 0;
  console.log(`📦 [Chunking] 初始化：共 ${state.chunkingTotalChunks} 段`);
  
  updateMessage(assistantMessageId, {
    thinking: `检测到超长文本，将分 ${state.chunkingTotalChunks} 段智能处理...`,
  });
}

/**
 * 处理 chunking_progress 事件
 */
export function handleChunkingProgress(
  parsed: any,
  state: StreamState,
  updateMessage: (id: string, updates: any) => void,
  assistantMessageId: string
): void {
  state.chunkingStage = parsed.stage || 'split';
  state.chunkingCurrentChunk = parsed.chunkIndex || 0;
  
  let thinkingText = '';
  if (state.chunkingStage === 'split') {
    thinkingText = '正在智能切分文本...';
  } else if (state.chunkingStage === 'map') {
    thinkingText = `正在分析第 ${state.chunkingCurrentChunk + 1}/${state.chunkingTotalChunks} 段...`;
  } else if (state.chunkingStage === 'reduce') {
    thinkingText = '正在合并分析结果...';
  } else if (state.chunkingStage === 'final') {
    thinkingText = '正在生成最终评审报告...';
  }
  
  console.log(`📊 [Chunking] ${thinkingText}`);
  
  updateMessage(assistantMessageId, {
    thinking: thinkingText,
  });
}

/**
 * 处理 chunking_chunk 事件
 */
export function handleChunkingChunk(
  parsed: any,
  state: StreamState,
  updateMessage: (id: string, updates: any) => void,
  assistantMessageId: string
): void {
  const chunkIndex = parsed.chunkIndex || 0;
  const chunkSummary = parsed.chunkSummary || '';
  
  console.log(`✅ [Chunking] 第 ${chunkIndex + 1} 段完成`);
  
  // 显示分段摘要（暂时只更新进度）
  updateMessage(assistantMessageId, {
    thinking: `已完成 ${chunkIndex + 1}/${state.chunkingTotalChunks} 段分析...`,
  });
}

