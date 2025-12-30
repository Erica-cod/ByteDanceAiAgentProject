/**
 * LoadStats - 加载统计信息组件
 * 
 * 职责：展示加载统计数据
 * 特点：
 * - 纯展示
 * - 支持格式化数字
 * - 响应式布局
 */

import React from 'react';
import './LoadStats.css';

export interface LoadStatsProps {
  /** 已加载数量 */
  loaded: number;
  /** 总数量 */
  total: number;
  /** 单位 */
  unit?: string;
  /** 是否显示成功图标 */
  showSuccessIcon?: boolean;
  /** 自定义类名 */
  className?: string;
}

export const LoadStats: React.FC<LoadStatsProps> = ({
  loaded,
  total,
  unit = '字符',
  showSuccessIcon = false,
  className = '',
}) => {
  const remaining = total - loaded;
  const isComplete = loaded >= total;
  
  return (
    <div className={`load-stats ${className}`}>
      {showSuccessIcon && isComplete && (
        <span className="load-stats__icon success">✅</span>
      )}
      
      <span className="load-stats__item">
        已加载: {loaded.toLocaleString()} / {total.toLocaleString()} {unit}
      </span>
      
      {!isComplete && (
        <>
          <span className="load-stats__separator">•</span>
          <span className="load-stats__item">
            剩余: {remaining.toLocaleString()} {unit}
          </span>
        </>
      )}
    </div>
  );
};

LoadStats.displayName = 'LoadStats';

