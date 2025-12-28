/**
 * MultiAgentDisplay - 多Agent协作输出展示组件
 * 
 * 功能：
 * - 分轮显示各Agent的输出
 * - 展示Host的决策
 * - 显示共识趋势
 * - 高亮最终报告
 */

import React, { useState, useEffect } from 'react';
import StreamingMarkdown from './StreamingMarkdown';
import './MultiAgentDisplay.css';

/**
 * Agent输出接口
 */
export interface AgentOutput {
  agent: string;
  round: number;
  output_type: string;
  content: string;
  metadata?: any;
  timestamp: string;
}

/**
 * Host决策接口
 */
export interface HostDecision {
  action: string;
  reason: string;
  next_agents: string[];
  consensus_level: number;
  timestamp: string;
}

/**
 * 轮次数据接口
 */
export interface RoundData {
  round: number;
  outputs: AgentOutput[];
  hostDecision?: HostDecision;
}

/**
 * 组件Props
 */
interface MultiAgentDisplayProps {
  rounds: RoundData[];
  status: 'in_progress' | 'converged' | 'terminated';
  consensusTrend: number[];
  streamingAgentContent?: Record<string, string>; // ✅ 新增：流式内容
  onHeightChange?: () => void; // ✅ 新增：高度变化回调（通知父组件重新计算虚拟化高度）
}

/**
 * Agent图标映射
 */
const AGENT_ICONS: Record<string, string> = {
  planner: '📋',
  critic: '🔍',
  host: '🎯',
  reporter: '📝',
};

/**
 * Agent名称映射
 */
const AGENT_NAMES: Record<string, string> = {
  planner: '规划师',
  critic: '批评家',
  host: '主持人',
  reporter: '报告员',
};

/**
 * 决策动作名称映射
 */
const ACTION_NAMES: Record<string, string> = {
  continue: '继续讨论',
  converge: '进入收敛',
  force_opposition: '强制反方',
  terminate: '终止讨论',
};

/**
 * 多Agent展示组件
 */
const MultiAgentDisplay: React.FC<MultiAgentDisplayProps> = ({
  rounds,
  status,
  consensusTrend,
  streamingAgentContent = {}, // ✅ 新增：流式内容
  onHeightChange, // ✅ 新增：高度变化回调
}) => {
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(
    new Set([rounds.length]) // 默认展开最新一轮
  );

  /**
   * ✅ 自动展开正在流式生成的轮次
   */
  useEffect(() => {
    const roundsWithStreaming = rounds.map(r => r.round).filter(round => {
      return rounds.find(rd => rd.round === round)?.outputs.some(output => {
        const streamKey = `${output.agent}:${output.round}`;
        return streamingAgentContent[streamKey] && 
               streamingAgentContent[streamKey] !== output.content;
      });
    });

    if (roundsWithStreaming.length > 0) {
      setExpandedRounds(prev => {
        const newSet = new Set(prev);
        let hasChanges = false;
        roundsWithStreaming.forEach(round => {
          if (!newSet.has(round)) {
            newSet.add(round);
            hasChanges = true;
          }
        });
        // ✅ 只有在真正展开新轮次时才通知高度变化
        if (hasChanges) {
          setTimeout(() => onHeightChange?.(), 100);
        }
        return newSet;
      });
    }
  }, [streamingAgentContent, rounds, onHeightChange]);

  /**
   * 切换轮次展开/收起
   */
  const toggleRound = (round: number) => {
    const newExpanded = new Set(expandedRounds);
    if (newExpanded.has(round)) {
      newExpanded.delete(round);
    } else {
      newExpanded.add(round);
    }
    setExpandedRounds(newExpanded);
    // ✅ 通知父组件高度变化
    setTimeout(() => onHeightChange?.(), 50);
  };

  /**
   * 展开所有轮次
   */
  const expandAll = () => {
    setExpandedRounds(new Set(rounds.map((r) => r.round)));
    // ✅ 通知父组件高度变化
    setTimeout(() => onHeightChange?.(), 100);
  };

  /**
   * 收起所有轮次
   */
  const collapseAll = () => {
    setExpandedRounds(new Set());
    // ✅ 通知父组件高度变化
    setTimeout(() => onHeightChange?.(), 50);
  };

  /**
   * 获取共识水平颜色
   */
  const getConsensusColor = (level: number): string => {
    if (level > 0.85) return '#4caf50'; // 绿色
    if (level > 0.70) return '#ff9800'; // 橙色
    return '#f44336'; // 红色
  };

  /**
   * 获取共识水平文本
   */
  const getConsensusText = (level: number): string => {
    if (level > 0.85) return '高共识';
    if (level > 0.70) return '中等共识';
    return '低共识';
  };

  return (
    <div className="multi-agent-display">
      {/* 顶部控制栏 */}
      <div className="multi-agent-header">
        <div className="header-info">
          <span className="status-badge" data-status={status}>
            {status === 'in_progress' && '⏳ 进行中'}
            {status === 'converged' && '✅ 已收敛'}
            {status === 'terminated' && '🛑 已终止'}
          </span>
          <span className="rounds-count">共 {rounds.length} 轮讨论</span>
        </div>
        <div className="header-controls">
          <button onClick={expandAll} className="control-btn">
            展开全部
          </button>
          <button onClick={collapseAll} className="control-btn">
            收起全部
          </button>
        </div>
      </div>

      {/* 共识趋势图 */}
      {consensusTrend.length > 0 && (
        <div className="consensus-trend">
          <div className="trend-label">
            共识趋势
            {consensusTrend.length > 0 && (
              <span className="trend-summary">
                {' '}(当前: {(consensusTrend[consensusTrend.length - 1] * 100).toFixed(1)}%)
              </span>
            )}
          </div>
          <div className="trend-chart">
            {consensusTrend.map((level, index) => (
              <div key={index} className="trend-bar-container">
                <div
                  className="trend-bar"
                  style={{
                    height: `${level * 100}%`,
                    backgroundColor: getConsensusColor(level),
                  }}
                  title={`第${index + 1}轮: ${(level * 100).toFixed(1)}%`}
                />
                <div className="trend-round-label">R{index + 1}</div>
                <div className="trend-value">{(level * 100).toFixed(0)}%</div>
              </div>
            ))}
          </div>
          <div className="trend-note">
            📊 共识趋势显示有Host决策的轮次（Reporter轮次无共识数据）
          </div>
        </div>
      )}

      {/* 轮次列表 */}
      <div className="rounds-list">
        {rounds.map((roundData) => {
          const isExpanded = expandedRounds.has(roundData.round);
          const isLastRound = roundData.round === rounds.length;

          // ✅ 检查本轮是否有正在流式生成的agent
          const streamingAgentsInRound = roundData.outputs.filter(output => {
            const streamKey = `${output.agent}:${output.round}`;
            return streamingAgentContent[streamKey] && 
                   streamingAgentContent[streamKey] !== output.content;
          });

          return (
            <div
              key={roundData.round}
              className={`round-item ${isExpanded ? 'expanded' : ''} ${
                isLastRound ? 'last-round' : ''
              }`}
            >
              {/* 轮次标题 */}
              <div
                className="round-header"
                onClick={() => toggleRound(roundData.round)}
              >
                <div className="round-title">
                  <span className="round-number">第 {roundData.round} 轮</span>
                  {streamingAgentsInRound.length > 0 && (
                    <span className="consensus-badge" style={{ backgroundColor: '#4CAF50' }}>
                      ⚡ {streamingAgentsInRound.map(a => AGENT_NAMES[a.agent]).join('、')} 生成中...
                    </span>
                  )}
                  {!streamingAgentsInRound.length && roundData.hostDecision && (
                    <span
                      className="consensus-badge"
                      style={{
                        backgroundColor: getConsensusColor(
                          roundData.hostDecision.consensus_level
                        ),
                      }}
                    >
                      {getConsensusText(roundData.hostDecision.consensus_level)} (
                      {(roundData.hostDecision.consensus_level * 100).toFixed(1)}%)
                    </span>
                  )}
                </div>
                <div className="round-agents">
                  {roundData.outputs.map((output) => {
                    const streamKey = `${output.agent}:${output.round}`;
                    const isStreaming = streamingAgentContent[streamKey] && 
                                       streamingAgentContent[streamKey] !== output.content;
                    return (
                      <span key={output.agent} className="agent-badge" style={{
                        background: isStreaming ? 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)' : undefined,
                        color: isStreaming ? 'white' : undefined,
                        animation: isStreaming ? 'pulse 1.5s ease-in-out infinite' : undefined,
                      }}>
                        {AGENT_ICONS[output.agent]} {AGENT_NAMES[output.agent]}
                        {isStreaming && ' ⚡'}
                      </span>
                    );
                  })}
                </div>
                <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
                  ▼
                </span>
              </div>

              {/* 轮次内容 */}
              {isExpanded && (
                <div className="round-content">
                  {roundData.outputs.map((output, index) => {
                    // ✅ 优先使用流式内容（如果agent正在生成中）
                    const streamKey = `${output.agent}:${output.round}`; // ✅ 使用 agent:round 格式
                    const displayContent = streamingAgentContent[streamKey] || output.content;
                    const isStreaming = streamingAgentContent[streamKey] && 
                                       streamingAgentContent[streamKey] !== output.content;
                    
                    return (
                      <div key={index} className={`agent-output agent-${output.agent}`}>
                        <div className="agent-header">
                          <span className="agent-icon">
                            {AGENT_ICONS[output.agent]}
                          </span>
                          <span className="agent-name">
                            {AGENT_NAMES[output.agent]}
                          </span>
                          <span className="output-type">{output.output_type}</span>
                          {isStreaming && <span className="streaming-indicator">⚡ 生成中...</span>}
                        </div>
                        <div className="agent-content">
                          <StreamingMarkdown content={displayContent} />
                        </div>
                      </div>
                    );
                  })}

                  {/* Host决策 */}
                  {roundData.hostDecision && (
                    <div className="host-decision">
                      <div className="decision-header">
                        <span className="decision-icon">🎯</span>
                        <span className="decision-title">主持人决策</span>
                      </div>
                      <div className="decision-content">
                        <div className="decision-action">
                          <strong>决策：</strong>
                          {ACTION_NAMES[roundData.hostDecision.action] ||
                            roundData.hostDecision.action}
                        </div>
                        <div className="decision-reason">
                          <strong>理由：</strong>
                          {roundData.hostDecision.reason}
                        </div>
                        <div className="decision-next">
                          <strong>下一轮发言：</strong>
                          {roundData.hostDecision.next_agents
                            .map((a) => AGENT_NAMES[a] || a)
                            .join('、')}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MultiAgentDisplay;

