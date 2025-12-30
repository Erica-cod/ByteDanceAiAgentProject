/**
 * ProgressBar - 进度条组件
 * 
 * 职责：展示加载进度
 * 特点：
 * - 纯展示组件
 * - 支持百分比显示
 * - 渐变色彩
 */

import React from 'react';
import './ProgressBar.css';

export interface ProgressBarProps {
  /** 进度百分比 (0-100) */
  progress: number;
  /** 是否显示百分比文本 */
  showText?: boolean;
  /** 自定义类名 */
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  showText = true,
  className = '',
}) => {
  const clampedProgress = Math.min(100, Math.max(0, progress));
  
  return (
    <div className={`progress-bar ${className}`}>
      <div className="progress-bar__track">
        <div 
          className="progress-bar__fill"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
      {showText && (
        <span className="progress-bar__text">{clampedProgress}%</span>
      )}
    </div>
  );
};

ProgressBar.displayName = 'ProgressBar';

