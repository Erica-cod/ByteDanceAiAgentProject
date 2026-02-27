import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ConversationList from './ConversationList';
import MessageList, { type MessageListHandle } from './MessageList';
import TextStatsIndicator from './TextStatsIndicator';
import SettingsPanel from './SettingsPanel';
import { initializeUser } from '../../utils/auth/userManager';
import { getPrivacyFirstDeviceId, showPrivacyNotice } from '../../utils/device/privacyFirstFingerprint';
import { useChatStore, useUIStore } from '../../stores';
import { useConversationManager, useMessageQueue, useMessageSender, useThrottle, useAutoResizeTextarea } from '../../hooks';
import './ChatInterface.css';

const ChatInterface: React.FC = () => {
  const { t } = useTranslation();
  
  // ===== Zustand Stores =====
  const messages = useChatStore((s) => s.messages);
  const conversationId = useChatStore((s) => s.conversationId);
  const userId = useChatStore((s) => s.userId);
  const setDeviceId = useChatStore((s) => s.setDeviceId); // ✅ 新增
  const firstItemIndex = useChatStore((s) => s.firstItemIndex);
  const hasMoreMessages = useChatStore((s) => s.hasMoreMessages);
  const isLoadingMore = useChatStore((s) => s.isLoadingMore);
  const loadOlderMessages = useChatStore((s) => s.loadOlderMessages);

  const isLoading = useUIStore((s) => s.isLoading);
  const modelType = useUIStore((s) => s.modelType);
  const chatMode = useUIStore((s) => s.chatMode);
  const setLoading = useUIStore((s) => s.setLoading);
  const setModelType = useUIStore((s) => s.setModelType);
  const setChatMode = useUIStore((s) => s.setChatMode);

  // ===== 本地 UI 状态 =====
  const [inputValue, setInputValue] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const listRef = useRef<MessageListHandle>(null);
  const thinkingEndRef = useRef<HTMLDivElement>(null);
  const messageCountRefs = useRef<Map<string, HTMLElement>>(new Map());
  
  // ===== 自适应输入框 =====
  const textareaRef = useAutoResizeTextarea(inputValue, 40, 200);

  // ===== 自定义 Hooks =====
  const { sendMessageInternal, retryMessage, abort } = useMessageSender({
    messageCountRefs,
    listRef,
    onConversationCreated: (convId) => {
      conversationManager.loadConversations().catch((err) =>
        console.error('刷新对话列表失败:', err)
      );
    },
  });

  const conversationManager = useConversationManager(userId, () => {
    abort();
    setLoading(false);
  });

  const processQueue = async () => {
    await messageQueue.processMessageQueue(sendMessageInternal);
    if (messageQueue.queue.length > 0) {
      setTimeout(() => processQueue(), 500);
    }
  };

  const messageQueue = useMessageQueue({
    onProcessQueue: processQueue,
  });

  // ===== 副作用 =====
  // ✅ 初始化设备 ID（最优先）
  useEffect(() => {
    (async () => {
      const id = await getPrivacyFirstDeviceId();
      setDeviceId(id); // ✅ 设置到 Zustand store
      showPrivacyNotice(); // 显示隐私说明
      console.log('🔐 设备 ID（Hash）已生成:', id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ 移除 Thinking 区域自动滚动，避免触发意外的滚动行为
  // useEffect(() => {
  //   if (thinkingEndRef.current) {
  //     const thinkingContainer = thinkingEndRef.current.closest('.thinking-content');
  //     if (thinkingContainer) {
  //       thinkingContainer.scrollTop = thinkingContainer.scrollHeight;
  //     }
  //   }
  // }, [messages]);

  // ✅ 切换对话时通过 key 强制重新挂载，MessageList 会自动滚动到底部
  // 不需要额外的 useEffect，避免重复滚动

  // 初始化用户
  useEffect(() => {
    initializeUser(userId);
  }, [userId]);

  // 加载对话列表
  useEffect(() => {
    conversationManager.loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ===== 事件处理 =====
  const sendMessage = async () => {
    if (!inputValue.trim()) return;

    // 如果正在加载，加入队列
    if (isLoading) {
      messageQueue.addToQueue(inputValue);
      setInputValue('');
      return;
    }

    const messageText = inputValue;
    setInputValue('');
    await sendMessageInternal(messageText);

    // 发送完成后处理队列
    if (messageQueue.queue.length > 0) {
      console.log('📤 检查队列...');
      setTimeout(() => processQueue(), 500);
    }
  };

  // 🔧 节流：防止用户快速点击发送按钮导致重复发送
  const throttledSendMessage = useThrottle(sendMessage, 1000);

  // 🔧 节流：防止用户快速切换模式
  const throttledSetChatMode = useThrottle(setChatMode, 500);

  // 🔧 节流：防止用户误触清空历史（危险操作，时间长一点）
  const throttledClearHistory = useThrottle(conversationManager.clearHistory, 2000);

  const stopGeneration = () => {
    abort();
    setLoading(false);
  };

  return (
    <div className="app-container">
      {/* 离线指示器 */}
      {!messageQueue.isOnline && (
        <div className="offline-indicator">
          ⚠️ 网络已断开，队列中有 {messageQueue.queue.length} 条消息等待发送
        </div>
      )}

      <ConversationList
        conversations={conversationManager.conversations}
        currentConversationId={conversationId}
        onSelectConversation={conversationManager.handleSelectConversation}
        onNewConversation={conversationManager.handleNewConversation}
        onDeleteConversation={conversationManager.handleDeleteConversation}
        isLoading={conversationManager.isLoadingConversations}
        messageCountRefs={messageCountRefs}
      />

      <div className="chat-container">
        <div className="chat-header">
          <h1>{t('app.title')}</h1>
          <div className="header-controls">
            <label className="mode-switch">
              <span>{t('settings.chatMode')}：</span>
              <button
                className={`mode-btn ${chatMode === 'single' ? 'active' : ''}`}
                onClick={() => throttledSetChatMode('single')}
                disabled={isLoading}
                title={t('settings.singleAgent')}
              >
                {t('settings.singleAgent')}
              </button>
              <button
                className={`mode-btn ${chatMode === 'multi_agent' ? 'active' : ''}`}
                onClick={() => throttledSetChatMode('multi_agent')}
                disabled={isLoading}
                title={t('settings.multiAgent')}
              >
                🧠 {t('settings.multiAgent')}
              </button>
            </label>
            <button 
              onClick={() => setIsSettingsOpen(true)} 
              className="settings-btn"
              title={t('settings.title')}
            >
              ⚙️
            </button>
          </div>
        </div>

        <div className="chat-messages">
          {/* ✅ 关键修复：使用 key 强制在切换对话时重新挂载，确保滚动到底部 */}
          <MessageList
            key={conversationId || 'new'}
            ref={listRef}
            messages={messages}
            queue={messageQueue.queue}
            firstItemIndex={firstItemIndex}
            hasMoreMessages={hasMoreMessages}
            isLoadingMore={isLoadingMore}
            isLoading={isLoading}
            thinkingEndRef={thinkingEndRef}
            onLoadOlder={loadOlderMessages}
            onRetry={retryMessage}
          />
        </div>

        <div className="chat-input-container">
          <div className="chat-input-wrapper">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  throttledSendMessage();
                }
              }}
              placeholder={isLoading ? t('chat.generating') : t('chat.inputPlaceholder')}
              disabled={false}
              className="chat-input"
            />
            {isLoading ? (
              <button onClick={stopGeneration} className="send-btn stop-btn">
                {t('chat.abort')}
              </button>
            ) : (
              <button onClick={throttledSendMessage} className="send-btn" disabled={!inputValue.trim()}>
                {messageQueue.queue.length > 0 ? `${t('chat.sendButton')} (${messageQueue.queue.length})` : t('chat.sendButton')}
              </button>
            )}
          </div>
          
          {/* 文本统计指示器 */}
          {inputValue && (
            <TextStatsIndicator 
              text={inputValue}
              onWarningClick={() => {
                // TODO: 打开超长文本处理选项对话框
                console.log('超长文本警告点击');
              }}
            />
          )}
        </div>
      </div>
      
      {/* 设置面板 */}
      <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};

export default ChatInterface;
