import React from 'react';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '@/stores/themeStore';
import { useUIStore } from '@/stores';
import styles from './SettingsPanel.module.css';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useThemeStore();
  const { modelType, setModelType, chatMode, setChatMode } = useUIStore();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem('language', lng);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className={styles['settings-overlay']} onClick={onClose} />
      <div className={styles['settings-panel']}>
        <div className={styles['settings-header']}>
          <h2>{t('settings.title')}</h2>
          <button className={styles['settings-close']} onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        <div className={styles['settings-content']}>
          <div className={styles['settings-section']}>
            <h3>{t('settings.language')}</h3>
            <div className={styles['settings-options']}>
              <button
                className={`${styles['settings-option']} ${i18n.language === 'zh' ? styles.active : ''}`}
                onClick={() => changeLanguage('zh')}
              >
                <span className={styles['option-icon']}>🇨🇳</span>
                <span>{t('settings.chinese')}</span>
              </button>
              <button
                className={`${styles['settings-option']} ${i18n.language === 'en' ? styles.active : ''}`}
                onClick={() => changeLanguage('en')}
              >
                <span className={styles['option-icon']}>🇺🇸</span>
                <span>{t('settings.english')}</span>
              </button>
            </div>
          </div>

          <div className={styles['settings-section']}>
            <h3>{t('settings.theme')}</h3>
            <div className={styles['settings-options']}>
              <button
                className={`${styles['settings-option']} ${theme === 'light' ? styles.active : ''}`}
                onClick={() => setTheme('light')}
              >
                <span className={styles['option-icon']}>☀️</span>
                <span>{t('settings.light')}</span>
              </button>
              <button
                className={`${styles['settings-option']} ${theme === 'dark' ? styles.active : ''}`}
                onClick={() => setTheme('dark')}
              >
                <span className={styles['option-icon']}>🌙</span>
                <span>{t('settings.dark')}</span>
              </button>
              <button
                className={`${styles['settings-option']} ${theme === 'auto' ? styles.active : ''}`}
                onClick={() => setTheme('auto')}
              >
                <span className={styles['option-icon']}>🔄</span>
                <span>{t('settings.auto')}</span>
              </button>
            </div>
          </div>

          <div className={styles['settings-section']}>
            <h3>{t('settings.model')}</h3>
            <div className={styles['settings-options']}>
              <button
                className={`${styles['settings-option']} ${modelType === 'local' ? styles.active : ''}`}
                onClick={() => setModelType('local')}
              >
                <span className={styles['option-icon']}>💻</span>
                <span>{t('settings.localModel')}</span>
              </button>
              <button
                className={`${styles['settings-option']} ${modelType === 'volcano' ? styles.active : ''}`}
                onClick={() => setModelType('volcano')}
              >
                <span className={styles['option-icon']}>☁️</span>
                <span>{t('settings.remoteModel')}</span>
              </button>
            </div>
          </div>

          <div className={styles['settings-section']}>
            <h3>{t('settings.chatMode')}</h3>
            <div className={styles['settings-options']}>
              <button
                className={`${styles['settings-option']} ${chatMode === 'single' ? styles.active : ''}`}
                onClick={() => setChatMode('single')}
              >
                <span className={styles['option-icon']}>👤</span>
                <span>{t('settings.singleAgent')}</span>
              </button>
              <button
                className={`${styles['settings-option']} ${chatMode === 'multi_agent' ? styles.active : ''}`}
                onClick={() => setChatMode('multi_agent')}
              >
                <span className={styles['option-icon']}>👥</span>
                <span>{t('settings.multiAgent')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SettingsPanel;

