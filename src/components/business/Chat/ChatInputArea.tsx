/**
 * ChatInputArea - 聊天输入区业务组件
 * 
 * 职责：处理用户输入、发送、统计展示
 * 特点：
 * - 管理输入状态
 * - 处理发送逻辑
 * - 显示队列和统计信息
 * - 承载业务规则
 */

import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAutoResizeTextarea } from '../../../hooks';
import TextStatsIndicator from '../../TextStatsIndicator';
import './ChatInputArea.css';

export interface ChatInputAreaProps {
  /** 输入值 */
  value: string;
  /** 值变化回调 */
  onChange: (value: string) => void;
  /** 发送回调 */
  onSend: () => void;
  /** 停止生成回调 */
  onStop: () => void;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 队列长度 */
  queueLength?: number;
  /** 最大长度 */
  maxLength?: number;
  /** 是否显示统计 */
  showStats?: boolean;
  /** 统计警告点击回调 */
  onStatsWarningClick?: () => void;
}

export const ChatInputArea: React.FC<ChatInputAreaProps> = ({
  value,
  onChange,
  onSend,
  onStop,
  isLoading,
  queueLength = 0,
  maxLength,
  showStats = true,
  onStatsWarningClick,
}) => {
  const { t } = useTranslation();
  const textareaRef = useAutoResizeTextarea(value, 40, 200);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && value.trim()) {
        onSend();
      }
    }
  };

  return (
    <div className="chat-input-area">
      <div className="chat-input-area__wrapper">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isLoading ? t('chat.generating') : t('chat.inputPlaceholder')}
          disabled={false}
          maxLength={maxLength}
          className="chat-input-area__textarea"
        />
        
        {isLoading ? (
          <button 
            onClick={onStop} 
            className="chat-input-area__button stop"
          >
            {t('chat.abort')}
          </button>
        ) : (
          <button 
            onClick={onSend} 
            className="chat-input-area__button send"
            disabled={!value.trim()}
          >
            {queueLength > 0 
              ? `${t('chat.sendButton')} (${queueLength})` 
              : t('chat.sendButton')
            }
          </button>
        )}
      </div>
      
      {/* 文本统计 */}
      {showStats && value && (
        <TextStatsIndicator 
          text={value}
          onWarningClick={onStatsWarningClick}
        />
      )}
    </div>
  );
};

ChatInputArea.displayName = 'ChatInputArea';

