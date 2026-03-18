/**
 * MultiAgentDisplay - 多Agent协作输出展示组件
 *
 * 分轮显示各Agent的输出、Host决策、共识趋势。
 * 渲染细节已拆分到 AgentOutputCard / HostDecisionCard / ConsensusTrendChart。
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useThrottle } from '@/hooks';
import AgentOutputCard from './AgentOutputCard';
import HostDecisionCard from './HostDecisionCard';
import ConsensusTrendChart from './ConsensusTrendChart';
import type { RoundData } from '@/types/message';
import { AGENT_NAMES, AGENT_ICONS } from '@/constants';
import styles from './MultiAgentDisplay.module.css';

export type { AgentOutput, HostDecision, RoundData } from '@/types/message';

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

interface MultiAgentDisplayProps {
  rounds: RoundData[];
  status: 'in_progress' | 'converged' | 'terminated';
  consensusTrend: number[];
  streamingAgentContent?: Record<string, string>;
  onHeightChange?: () => void;
}

const MultiAgentDisplay: React.FC<MultiAgentDisplayProps> = ({
  rounds, status, consensusTrend, streamingAgentContent = {}, onHeightChange,
}) => {
  const prevRoundsRef = useRef<string>('');
  useEffect(() => {
    const sig = rounds.map(r => `${r.round}:${r.outputs.length}`).join(',');
    if (sig !== prevRoundsRef.current) {
      prevRoundsRef.current = sig;
      console.log(`[MultiAgentDisplay] 📦 接收到 ${rounds.length} 轮数据`);
    }
  }, [rounds]);

  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(() => {
    const streamingRounds = rounds
      .filter(r => r.outputs.some(o => {
        const key = `${o.agent}:${o.round}`;
        return streamingAgentContent && key in streamingAgentContent;
      }))
      .map(r => r.round);
    return new Set(streamingRounds.length > 0 ? [Math.max(...streamingRounds)] : [rounds.length]);
  });

  const throttledHeightChange = useThrottle(() => { onHeightChange?.(); }, 600);

  // 自动展开有流式内容的轮次
  useEffect(() => {
    const streamingRoundNums = rounds
      .filter(r => r.outputs.some(o => streamingAgentContent && `${o.agent}:${o.round}` in streamingAgentContent))
      .map(r => r.round);

    if (streamingRoundNums.length > 0) {
      setExpandedRounds(prev => {
        const next = new Set(prev);
        streamingRoundNums.forEach(rn => next.add(rn));
        return next;
      });
    }
  }, [streamingAgentContent, rounds]);

  const toggleRound = useCallback((round: number) => {
    const next = new Set(expandedRounds);
    const isExpanding = !next.has(round);
    if (next.has(round)) next.delete(round); else next.add(round);
    setExpandedRounds(next);
    if (!isExpanding) throttledHeightChange();
  }, [expandedRounds, throttledHeightChange]);

  const expandAll = useCallback(() => {
    setExpandedRounds(new Set(rounds.map(r => r.round)));
  }, [rounds]);

  const collapseAll = useCallback(() => {
    setExpandedRounds(new Set());
    throttledHeightChange();
  }, [throttledHeightChange]);

  return (
    <div className={styles['multi-agent-display']}>
      <div className={styles['multi-agent-header']}>
        <div className={styles['header-info']}>
          <span className={styles['status-badge']} data-status={status}>
            {status === 'in_progress' && '⏳ 进行中'}
            {status === 'converged' && '✅ 已收敛'}
            {status === 'terminated' && '🛑 已终止'}
          </span>
          <span className={styles['rounds-count']}>共 {rounds.length} 轮讨论</span>
        </div>
        <div className={styles['header-controls']}>
          <button onClick={expandAll} className={styles['control-btn']}>展开全部</button>
          <button onClick={collapseAll} className={styles['control-btn']}>收起全部</button>
        </div>
      </div>

      <ConsensusTrendChart consensusTrend={consensusTrend} />

      <div className={styles['rounds-list']}>
        {rounds.map((roundData) => {
          const isExpanded = expandedRounds.has(roundData.round);
          const isLastRound = roundData.round === rounds.length;
          const streamingAgentsInRound = roundData.outputs.filter(o =>
            streamingAgentContent && `${o.agent}:${o.round}` in streamingAgentContent,
          );

          return (
            <div
              key={roundData.round}
              className={`${styles['round-item']} ${isExpanded ? styles.expanded : ''} ${isLastRound ? styles['last-round'] : ''}`}
            >
              <div className={styles['round-header']} onClick={() => toggleRound(roundData.round)}>
                <div className={styles['round-title']}>
                  <span className={styles['round-number']}>第 {roundData.round} 轮</span>
                  {streamingAgentsInRound.length > 0 && (
                    <span className={styles['consensus-badge']} style={{ backgroundColor: '#4CAF50' }}>
                      ⚡ {streamingAgentsInRound.map(a => AGENT_NAMES[a.agent]).join('、')} 生成中...
                    </span>
                  )}
                  {!streamingAgentsInRound.length && roundData.hostDecision && (
                    <span className={styles['consensus-badge']} style={{ backgroundColor: getConsensusColor(roundData.hostDecision.consensus_level) }}>
                      {getConsensusText(roundData.hostDecision.consensus_level)} ({(roundData.hostDecision.consensus_level * 100).toFixed(1)}%)
                    </span>
                  )}
                </div>
                <div className={styles['round-agents']}>
                  {roundData.outputs.map((output) => {
                    const isStreaming = streamingAgentContent && `${output.agent}:${output.round}` in streamingAgentContent;
                    return (
                      <span key={output.agent} className={styles['agent-badge']} style={{
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
                <span className={`${styles['expand-icon']} ${isExpanded ? styles.expanded : ''}`}>▼</span>
              </div>

              {isExpanded && (
                <div className={styles['round-content']}>
                  {roundData.outputs.map((output, index) => {
                    const streamKey = `${output.agent}:${output.round}`;
                    const streamContent = streamingAgentContent?.[streamKey];
                    const hasStreamKey = streamingAgentContent && streamKey in streamingAgentContent;
                    const displayContent = streamContent !== undefined ? streamContent : output.content;
                    if (!displayContent && !hasStreamKey) return null;

                    return (
                      <AgentOutputCard
                        key={index}
                        agent={output.agent}
                        outputType={output.output_type}
                        displayContent={displayContent}
                        isStreaming={!!hasStreamKey}
                      />
                    );
                  })}
                  {roundData.hostDecision && <HostDecisionCard decision={roundData.hostDecision} />}
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
