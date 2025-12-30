/**
 * ChatInterface - 聊天界面（重构版）
 * 
 * 职责：组合所有聊天相关组件，管理顶层状态和业务逻辑
 * 重构改进：
 * - 使用 ChatLayout 替代手动布局
 * - 使用 ChatHeader + HeaderControls 替代内联头部
 * - 使用 ChatInputArea 替代内联输入区
 * - 职责更清晰，代码更简洁
 */

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ConversationList from '../../ConversationList';
import MessageList, { type MessageListHandle } from '../../MessageList';
import SettingsPanel from '../../SettingsPanel';
import { ChatLayout } from '../../base/Layout';
import { ChatHeader } from '../../base/Layout';
import { HeaderControls } from './HeaderControls';
import { ChatInputArea } from './ChatInputArea';
import { initializeUser } from '../../../utils/userManager';
import { getPrivacyFirstDeviceId, showPrivacyNotice } from '../../../utils/privacyFirstFingerprint';
import { useChatStore, useUIStore } from '../../../stores';
import { useConversationManager, useMessageQueue, useMessageSender, useThrottle } from '../../../hooks';
import './ChatInterfaceRefactored.css';

const ChatInterfaceRefactored: React.FC = () => {
  const { t } = useTranslation();
  
  // ===== Zustand Stores =====
  const messages = useChatStore((s) => s.messages);
  const conversationId = useChatStore((s) => s.conversationId);
  const userId = useChatStore((s) => s.userId);
  const setDeviceId = useChatStore((s) => s.setDeviceId);
  const firstItemIndex = useChatStore((s) => s.firstItemIndex);
  const hasMoreMessages = useChatStore((s) => s.hasMoreMessages);
  const isLoadingMore = useChatStore((s) => s.isLoadingMore);
  const loadOlderMessages = useChatStore((s) => s.loadOlderMessages);

  const isLoading = useUIStore((s) => s.isLoading);
  const modelType = useUIStore((s) => s.modelType);
  const chatMode = useUIStore((s) => s.chatMode);
  const setLoading = useUIStore((s) => s.setLoading);
  const setChatMode = useUIStore((s) => s.setChatMode);

  // ===== 本地 UI 状态 =====
  const [inputValue, setInputValue] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const listRef = useRef<MessageListHandle>(null);
  const thinkingEndRef = useRef<HTMLDivElement>(null);
  const messageCountRefs = useRef<Map<string, HTMLElement>>(new Map());

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

  // ===== 初始化 =====
  useEffect(() => {
    (async () => {
      const id = await getPrivacyFirstDeviceId();
      setDeviceId(id);
      showPrivacyNotice();
      console.log('🔐 设备 ID（Hash）已生成:', id);
    })();
  }, [setDeviceId]);

  useEffect(() => {
    initializeUser(userId);
  }, [userId]);

  useEffect(() => {
    conversationManager.loadConversations().catch(console.error);
  }, [conversationManager]);

  // ===== 业务逻辑 =====
  const handleSendMessage = () => {
    if (!inputValue.trim()) return;
    messageQueue.addToQueue(inputValue);
    setInputValue('');
  };

  const handleStopGeneration = () => {
    abort();
    setLoading(false);
  };

  const throttledSendMessage = useThrottle(handleSendMessage, 300);
  const throttledSetChatMode = useThrottle(setChatMode, 500);

  // ===== 渲染组件 =====
  
  // 头部内容
  const headerContent = (
    <ChatHeader
      title={<h1>{t('app.title')}</h1>}
      controls={
        <HeaderControls
          chatMode={chatMode}
          onModeChange={throttledSetChatMode}
          onSettingsClick={() => setIsSettingsOpen(true)}
          disabled={isLoading}
        />
      }
    />
  );

  // 主内容
  const mainContent = (
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
  );

  // 底部内容
  const footerContent = (
    <ChatInputArea
      value={inputValue}
      onChange={setInputValue}
      onSend={throttledSendMessage}
      onStop={handleStopGeneration}
      isLoading={isLoading}
      queueLength={messageQueue.queue.length}
      onStatsWarningClick={() => {
        console.log('超长文本警告点击');
      }}
    />
  );

  return (
    <div className="chat-interface-refactored">
      {/* 对话列表 */}
      <ConversationList
        conversations={conversationManager.conversations}
        currentConversationId={conversationId}
        onSelectConversation={conversationManager.switchConversation}
        onCreateConversation={conversationManager.createNewConversation}
        onDeleteConversation={conversationManager.deleteConversation}
        onUpdateTitle={conversationManager.updateTitle}
        isLoadingConversations={conversationManager.isLoading}
        messageCountRefs={messageCountRefs}
      />

      {/* 聊天区域 - 使用重构后的布局 */}
      <ChatLayout
        header={headerContent}
        content={mainContent}
        footer={footerContent}
      />

      {/* 设置面板 */}
      <SettingsPanel 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </div>
  );
};

export default ChatInterfaceRefactored;

