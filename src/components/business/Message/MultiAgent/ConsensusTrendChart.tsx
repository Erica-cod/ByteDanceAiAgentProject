/**
 * ConsensusTrendChart - 共识趋势柱状图
 */

import React from 'react';

interface ConsensusTrendChartProps {
  consensusTrend: number[];
}

const getConsensusColor = (level: number): string => {
  if (level > 0.85) return '#4caf50';
  if (level > 0.70) return '#ff9800';
  return '#f44336';
};

const ConsensusTrendChart: React.FC<ConsensusTrendChartProps> = ({ consensusTrend }) => {
  if (consensusTrend.length === 0) return null;

  return (
    <div className="consensus-trend">
      <div className="trend-label">
        共识趋势
        <span className="trend-summary">
          {' '}(当前: {(consensusTrend[consensusTrend.length - 1] * 100).toFixed(1)}%)
        </span>
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
  );
};

export default ConsensusTrendChart;
