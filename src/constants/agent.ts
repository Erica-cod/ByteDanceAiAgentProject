/**
 * 多 Agent 协作相关常量
 */

export const AGENT_ICONS: Record<string, string> = {
  planner: '📋',
  critic: '🔍',
  host: '🎯',
  reporter: '📝',
};

export const AGENT_NAMES: Record<string, string> = {
  planner: '规划师',
  critic: '批评家',
  host: '主持人',
  reporter: '报告员',
};

export const ACTION_NAMES: Record<string, string> = {
  continue: '继续讨论',
  converge: '进入收敛',
  force_opposition: '强制反方',
  terminate: '终止讨论',
};

export const AGENT_STREAMING_MESSAGES: Record<string, string> = {
  planner: '正在制定规划方案...',
  critic: '正在审查方案可行性...',
  host: '正在评估讨论进展...',
  reporter: '正在撰写最终报告...',
};
