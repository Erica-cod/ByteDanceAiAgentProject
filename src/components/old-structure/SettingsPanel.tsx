import React from 'react';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '../../stores/themeStore';
import { useUIStore } from '../../stores';
import './SettingsPanel.css';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useThemeStore();
  const { modelType, setModelType, chatMode, setChatMode } = useUIStore();
  
  // 更改语言
  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem('language', lng);
  };
  
  if (!isOpen) return null;
  
  return (
    <>
      <div className="settings-overlay" onClick={onClose} />
      <div className="settings-panel">
        <div className="settings-header">
          <h2>{t('settings.title')}</h2>
          <button className="settings-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        
        <div className="settings-content">
          {/* 语言设置 */}
          <div className="settings-section">
            <h3>{t('settings.language')}</h3>
            <div className="settings-options">
              <button
                className={`settings-option ${i18n.language === 'zh' ? 'active' : ''}`}
                onClick={() => changeLanguage('zh')}
              >
                <span className="option-icon">🇨🇳</span>
                <span>{t('settings.chinese')}</span>
              </button>
              <button
                className={`settings-option ${i18n.language === 'en' ? 'active' : ''}`}
                onClick={() => changeLanguage('en')}
              >
                <span className="option-icon">🇺🇸</span>
                <span>{t('settings.english')}</span>
              </button>
            </div>
          </div>
          
          {/* 主题设置 */}
          <div className="settings-section">
            <h3>{t('settings.theme')}</h3>
            <div className="settings-options">
              <button
                className={`settings-option ${theme === 'light' ? 'active' : ''}`}
                onClick={() => setTheme('light')}
              >
                <span className="option-icon">☀️</span>
                <span>{t('settings.light')}</span>
              </button>
              <button
                className={`settings-option ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => setTheme('dark')}
              >
                <span className="option-icon">🌙</span>
                <span>{t('settings.dark')}</span>
              </button>
              <button
                className={`settings-option ${theme === 'auto' ? 'active' : ''}`}
                onClick={() => setTheme('auto')}
              >
                <span className="option-icon">🔄</span>
                <span>{t('settings.auto')}</span>
              </button>
            </div>
          </div>
          
          {/* 模型选择 */}
          <div className="settings-section">
            <h3>{t('settings.model')}</h3>
            <div className="settings-options">
              <button
                className={`settings-option ${modelType === 'local' ? 'active' : ''}`}
                onClick={() => setModelType('local')}
              >
                <span className="option-icon">🤖</span>
                <span>Ollama</span>
              </button>
              <button
                className={`settings-option ${modelType === 'volcano' ? 'active' : ''}`}
                onClick={() => setModelType('volcano')}
              >
                <span className="option-icon">🔥</span>
                <span>Doubao</span>
              </button>
            </div>
          </div>
          
          {/* 对话模式 */}
          <div className="settings-section">
            <h3>{t('settings.chatMode')}</h3>
            <div className="settings-options">
              <button
                className={`settings-option ${chatMode === 'single' ? 'active' : ''}`}
                onClick={() => setChatMode('single')}
              >
                <span className="option-icon">👤</span>
                <span>{t('settings.singleAgent')}</span>
              </button>
              <button
                className={`settings-option ${chatMode === 'multi_agent' ? 'active' : ''}`}
                onClick={() => setChatMode('multi_agent')}
              >
                <span className="option-icon">👥</span>
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

