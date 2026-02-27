import React from 'react';
import { isLongText, type TextStats } from '../../utils/text/textUtils';
import './TextStatsIndicator.css';

interface TextStatsIndicatorProps {
  text: string;
  onWarningClick?: () => void;
}

/**
 * 文本统计指示器组件
 * 显示字符数、行数，并在文本过长时显示警告
 */
const TextStatsIndicator: React.FC<TextStatsIndicatorProps> = ({ text, onWarningClick }) => {
  const detection = isLongText(text);
  const { stats, level, reason } = detection;

  // 空文本不显示
  if (stats.chars === 0) {
    return null;
  }

  return (
    <div className={`text-stats-indicator ${level !== 'none' ? `warning-${level}` : ''}`}>
      <div className="stats-info">
        <span className="stat-item">{stats.chars} 字符</span>
        <span className="stat-separator">·</span>
        <span className="stat-item">{stats.lines} 行</span>
      </div>
      
      {level !== 'none' && (
        <div className="stats-warning" onClick={onWarningClick}>
          <span className="warning-icon">⚠️</span>
          <span className="warning-text">{reason}</span>
          {onWarningClick && <span className="warning-action">点击查看选项</span>}
        </div>
      )}
    </div>
  );
};

export default TextStatsIndicator;

