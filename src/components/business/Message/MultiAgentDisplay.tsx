/**
 * MultiAgentDisplay - 多Agent协作输出展示组件
 *
 * 功能：
 * - 分轮显示各Agent的输出
 * - 展示Host的决策
 * - 显示共识趋势
 * - 高亮最终报告
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import StreamingMarkdown from './StreamingMarkdown';
import { useThrottle } from '../../../hooks';
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
  streamingAgentContent?: Record<string, string>;
  onHeightChange?: () => void;
}

const AGENT_ICONS: Record<string, string> = {
  planner: '📋',
  critic: '🔍',
  host: '🎯',
  reporter: '📝',
};

const AGENT_NAMES: Record<string, string> = {
  planner: '规划师',
  critic: '批评家',
  host: '主持人',
  reporter: '报告员',
};

const ACTION_NAMES: Record<string, string> = {
  continue: '继续讨论',
  converge: '进入收敛',
  force_opposition: '强制反方',
  terminate: '终止讨论',
};

const MultiAgentDisplay: React.FC<MultiAgentDisplayProps> = ({
  rounds,
  status,
  consensusTrend,
  streamingAgentContent = {},
  onHeightChange,
}) => {
  const prevRoundsRef = useRef<string>('');
  useEffect(() => {
    const roundsSignature = rounds.map(r => `${r.round}:${r.outputs.length}`).join(',');
    if (roundsSignature !== prevRoundsRef.current) {
      prevRoundsRef.current = roundsSignature;
      console.log(`[MultiAgentDisplay] 📦 接收到 ${rounds.length} 轮数据:`);
      rounds.forEach((round) => {
        console.log(`[MultiAgentDisplay]   第 ${round.round} 轮: ${round.outputs.length} 个agent输出 [${round.outputs.map(o => o.agent).join(', ')}]`);
      });
    }
  }, [rounds]);

  useEffect(() => {
    const keys = Object.keys(streamingAgentContent);
    if (keys.length > 0) {
      console.log('🎨 [MultiAgentDisplay] 收到 streamingAgentContent:', keys, streamingAgentContent);
    }
  }, [streamingAgentContent]);

  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(() => {
    const streamingRounds = rounds
      .filter(r => r.outputs.some(output => {
        const streamKey = `${output.agent}:${output.round}`;
        return streamingAgentContent && streamKey in streamingAgentContent;
      }))
      .map(r => r.round);

    return new Set(streamingRounds.length > 0 ? [Math.max(...streamingRounds)] : [rounds.length]);
  });

  const throttledHeightChange = useThrottle(() => {
    onHeightChange?.();
  }, 600);

  useEffect(() => {
    const roundsWithStreaming = rounds.map(r => r.round).filter(round => {
      return rounds.find(rd => rd.round === round)?.outputs.some(output => {
        const streamKey = `${output.agent}:${output.round}`;
        return streamingAgentContent && streamKey in streamingAgentContent;
      });
    });

    if (roundsWithStreaming.length > 0) {
      setExpandedRounds(prev => {
        const newSet = new Set(prev);
        roundsWithStreaming.forEach(round => {
          if (!newSet.has(round)) {
            newSet.add(round);
          }
        });
        return newSet;
      });
    }
  }, [streamingAgentContent, rounds, onHeightChange]);

  const toggleRound = useCallback((round: number) => {
    const newExpanded = new Set(expandedRounds);
    const isExpanding = !newExpanded.has(round);

    if (newExpanded.has(round)) {
      newExpanded.delete(round);
    } else {
      newExpanded.add(round);
    }
    setExpandedRounds(newExpanded);

    if (!isExpanding) {
      throttledHeightChange();
    }
  }, [expandedRounds, throttledHeightChange]);

  const expandAll = useCallback(() => {
    setExpandedRounds(new Set(rounds.map((r) => r.round)));
  }, [rounds, onHeightChange]);

  const collapseAll = useCallback(() => {
    setExpandedRounds(new Set());
    throttledHeightChange();
  }, [throttledHeightChange]);

  const getConsensusColor = (level: number): string => {
    if (level > 0.85) return '#4caf50';
    if (level > 0.70) return '#ff9800';
    return '#f44336';
  };

  const getConsensusText = (level: number): string => {
    if (level > 0.85) return '高共识';
    if (level > 0.70) return '中等共识';
    return '低共识';
  };

  return (
    <div className="multi-agent-display">
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

      <div className="rounds-list">
        {rounds.map((roundData) => {
          const isExpanded = expandedRounds.has(roundData.round);
          const isLastRound = roundData.round === rounds.length;
          const streamingAgentsInRound = roundData.outputs.filter(output => {
            const streamKey = `${output.agent}:${output.round}`;
            return streamingAgentContent && streamKey in streamingAgentContent;
          });

          return (
            <div
              key={roundData.round}
              className={`round-item ${isExpanded ? 'expanded' : ''} ${
                isLastRound ? 'last-round' : ''
              }`}
            >
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
                    const isStreaming = streamingAgentContent && streamKey in streamingAgentContent;
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

              {isExpanded && (
                <div className="round-content">
                  {roundData.outputs.map((output, index) => {
                    const streamKey = `${output.agent}:${output.round}`;
                    const streamContent = streamingAgentContent?.[streamKey];
                    const hasStreamKey = streamingAgentContent && streamKey in streamingAgentContent;
                    const displayContent = streamContent !== undefined ? streamContent : output.content;
                    const isStreaming = hasStreamKey;

                    if (!displayContent && !hasStreamKey) {
                      return null;
                    }

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
                          {displayContent && displayContent.trim() ? (
                            <StreamingMarkdown content={displayContent} />
                          ) : isStreaming ? (
                            <div className="streaming-placeholder">
                              <div className="typing-indicator">
                                <span></span>
                                <span></span>
                                <span></span>
                              </div>
                              <span className="streaming-text">正在生成分析...</span>
                            </div>
                          ) : (
                            <div className="typing-indicator">
                              <span></span>
                              <span></span>
                              <span></span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

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

