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
import styles from './HeaderControls.module.css';

export interface HeaderControlsProps {
  /** 当前聊天模式 */
  chatMode: 'single' | 'multi_agent';
  /** 模式变更回调 */
  onModeChange: (mode: 'single' | 'multi_agent') => void;
  /** 设置按钮点击回调 */
  onSettingsClick: () => void;
  /** 是否禁用（加载中） */
  disabled?: boolean;
  /** 是否已登录（演示版） */
  loggedIn?: boolean;
  /** 是否允许使用多 Agent（登录后才允许） */
  canUseMultiAgent?: boolean;
  /** 演示登录 */
  onDemoLogin?: () => void;
  /** 退出登录 */
  onLogout?: () => void;
}

export const HeaderControls: React.FC<HeaderControlsProps> = ({
  chatMode,
  onModeChange,
  onSettingsClick,
  disabled = false,
  loggedIn = false,
  canUseMultiAgent = true,
  onDemoLogin,
  onLogout,
}) => {
  const { t } = useTranslation();
  
  const multiDisabled = disabled || !canUseMultiAgent;
  const multiTitle = canUseMultiAgent ? t('settings.multiAgent') : '登录后才能使用多 Agent（演示）';

  return (
    <div className={styles['header-controls']}>
      {/* 模式切换 */}
      <label className={styles['header-controls__mode-switch']}>
        <span>{t('settings.chatMode')}：</span>
        <button
          className={`${styles['mode-btn']} ${chatMode === 'single' ? styles.active : ''}`}
          onClick={() => onModeChange('single')}
          disabled={disabled}
          title={t('settings.singleAgent')}
        >
          {t('settings.singleAgent')}
        </button>
        <button
          className={`${styles['mode-btn']} ${chatMode === 'multi_agent' ? styles.active : ''}`}
          onClick={() => onModeChange('multi_agent')}
          disabled={multiDisabled}
          title={multiTitle}
        >
          🧠 {t('settings.multiAgent')}
        </button>
      </label>
      
      {/* 演示登录/退出（方便你本地演示多Agent解锁） */}
      {loggedIn ? (
        <button
          onClick={onLogout}
          className={styles['header-controls__settings-btn']}
          disabled={disabled}
          title="退出登录（演示）"
        >
          退出
        </button>
      ) : (
        <button
          onClick={onDemoLogin}
          className={styles['header-controls__settings-btn']}
          disabled={disabled}
          title="演示登录（解锁多 Agent）"
        >
          登录
        </button>
      )}

      {/* 设置按钮 */}
      <button 
        onClick={onSettingsClick} 
        className={styles['header-controls__settings-btn']}
        title={t('settings.title')}
      >
        ⚙️
      </button>
    </div>
  );
};

HeaderControls.displayName = 'HeaderControls';

