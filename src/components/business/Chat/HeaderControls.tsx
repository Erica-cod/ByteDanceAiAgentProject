/**
 * HeaderControls - 头部控制区业务组件
 * 
 * 职责：提供聊天模式切换和设置按钮
 * 特点：
 * - 知道聊天模式的业务含义
 * - 处理模式切换逻辑
 * - 管理禁用状态
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import './HeaderControls.css';

export interface HeaderControlsProps {
  /** 当前聊天模式 */
  chatMode: 'single' | 'multi_agent';
  /** 模式变更回调 */
  onModeChange: (mode: 'single' | 'multi_agent') => void;
  /** 设置按钮点击回调 */
  onSettingsClick: () => void;
  /** 是否禁用（加载中） */
  disabled?: boolean;
}

export const HeaderControls: React.FC<HeaderControlsProps> = ({
  chatMode,
  onModeChange,
  onSettingsClick,
  disabled = false,
}) => {
  const { t } = useTranslation();
  
  return (
    <div className="header-controls">
      {/* 模式切换 */}
      <label className="header-controls__mode-switch">
        <span>{t('settings.chatMode')}：</span>
        <button
          className={`mode-btn ${chatMode === 'single' ? 'active' : ''}`}
          onClick={() => onModeChange('single')}
          disabled={disabled}
          title={t('settings.singleAgent')}
        >
          {t('settings.singleAgent')}
        </button>
        <button
          className={`mode-btn ${chatMode === 'multi_agent' ? 'active' : ''}`}
          onClick={() => onModeChange('multi_agent')}
          disabled={disabled}
          title={t('settings.multiAgent')}
        >
          🧠 {t('settings.multiAgent')}
        </button>
      </label>
      
      {/* 设置按钮 */}
      <button 
        onClick={onSettingsClick} 
        className="header-controls__settings-btn"
        title={t('settings.title')}
      >
        ⚙️
      </button>
    </div>
  );
};

HeaderControls.displayName = 'HeaderControls';

