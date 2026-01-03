/**
 * useSSEStream 相关类型定义
 */

import type { RoundData } from '../../../components/old-structure/MultiAgentDisplay';

export interface UseSSEStreamOptions {
  onConversationCreated?: (convId: string) => void;
}

export interface StreamState {
  // 单 Agent 模式状态
  currentContent: string;
  currentThinking: string;
  
  // 多 Agent 模式状态
  multiAgentRounds: RoundData[];
  multiAgentStatus: 'in_progress' | 'converged' | 'terminated';
  multiAgentConsensusTrend: number[];
  currentRound: RoundData | null;
  completedRounds: number;
  agentStreamingContent: Map<string, string>;
  
  // Chunking 模式状态
  chunkingTotalChunks: number;
  chunkingCurrentChunk: number;
  chunkingStage: 'split' | 'map' | 'reduce' | 'final';
}

export interface StreamResult {
  completed: boolean;
  aborted: boolean;
  retryAfterMs?: number;
}

export interface UploadPayload {
  message?: string;
  uploadSessionId?: string;
  isCompressed?: boolean;
}

