import React from 'react';
import { isLongText } from '@/utils/text/textUtils';
import styles from './TextStatsIndicator.module.css';

interface TextStatsIndicatorProps {
  text: string;
  onWarningClick?: () => void;
}

/**
 * 文本统计指示器组件
 * 显示字符数、行数，并在文本过长时显示警告
 */
const TextStatsIndicator: React.FC<TextStatsIndicatorProps> = ({ text, onWarningClick }) => {
  const { stats, level, reason } = isLongText(text);

  if (stats.chars === 0) {
    return null;
  }

  return (
    <div className={`${styles['text-stats-indicator']} ${level !== 'none' ? styles[`warning-${level}`] : ''}`}>
      <div className={styles['stats-info']}>
        <span className={styles['stat-item']}>{stats.chars} 字符</span>
        <span className={styles['stat-separator']}>·</span>
        <span className={styles['stat-item']}>{stats.lines} 行</span>
      </div>

      {level !== 'none' && (
        <div className={styles['stats-warning']} onClick={onWarningClick}>
          <span className={styles['warning-icon']}>⚠️</span>
          <span className={styles['warning-text']}>{reason}</span>
          {onWarningClick && <span className={styles['warning-action']}>点击查看选项</span>}
        </div>
      )}
    </div>
  );
};

export default TextStatsIndicator;

