/**
 * SSE 流式传输相关类型定义
 */

import type { RoundData } from './message';
import type { MonitorInstance } from 'ai-stream-monitor';

export interface UseSSEStreamOptions {
  onConversationCreated?: (convId: string) => void;
  monitor?: MonitorInstance | null;
}

export interface StreamState {
  currentContent: string;
  currentThinking: string;

  multiAgentRounds: RoundData[];
  multiAgentStatus: 'in_progress' | 'converged' | 'terminated';
  multiAgentConsensusTrend: number[];
  currentRound: RoundData | null;
  completedRounds: number;
  agentStreamingContent: Map<string, string>;

  chunkingTotalChunks: number;
  chunkingCurrentChunk: number;
  chunkingStage: 'split' | 'map' | 'reduce' | 'final';
}

export interface StreamResult {
  completed: boolean;
  aborted: boolean;
  retryAfterMs?: number;
  chunkCount?: number;
}

export interface UploadPayload {
  message?: string;
  uploadSessionId?: string;
  isCompressed?: boolean;
}
