/**
 * 消息相关类型定义
 *
 * 前端 Store 中使用的 Message 类型，以及多 Agent 协作的数据结构。
 * 统一定义在此处，避免 hooks/components/stores 之间的循环引用。
 */

export interface Message {
  id: string;
  clientMessageId?: string;
  role: 'user' | 'assistant';
  content: string;
  contentLength?: number;
  thinking?: string;
  sources?: Array<{ title: string; url: string }>;
  timestamp: number;
  pendingSync?: boolean;
  failed?: boolean;
  retryCount?: number;
  multiAgentData?: {
    rounds: RoundData[];
    status: 'in_progress' | 'converged' | 'terminated';
    consensusTrend: number[];
  };
  streamingAgentContent?: Record<string, string>;
}

export interface AgentOutput {
  agent: string;
  round: number;
  output_type: string;
  content: string;
  metadata?: any;
  timestamp: string;
}

export interface HostDecision {
  action: string;
  reason: string;
  next_agents: string[];
  consensus_level: number;
  timestamp: string;
}

export interface RoundData {
  round: number;
  outputs: AgentOutput[];
  hostDecision?: HostDecision;
}

/**
 * MessageList 组件的命令式句柄接口
 * 供 useMessageSender 等 hooks 引用，避免 hooks→components 反向依赖
 */
export interface MessageListHandle {
  scrollToRow: (index: number) => void;
  scrollToBottom: () => void;
  recomputeRowHeights: (index?: number) => void;
}
