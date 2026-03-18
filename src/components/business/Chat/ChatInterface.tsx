/**
 * ChatInterface - 聊天主界面
 *
 * 职责：组合所有聊天相关组件，管理顶层 UI 状态。
 * 业务初始化、跨 Tab 同步、性能 Mock 已拆分到独立 Hooks。
 */

import React, { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import MessageList from '../Message/MessageList';
import { ChatLayout } from '@/components/base/Layout';
import { ChatHeader } from '@/components/base/Layout';
import { HeaderControls } from './HeaderControls';
import { ChatInputArea } from './ChatInputArea';
import { useChatStore, useUIStore } from '@/stores';
import { useConversationManager, useMessageQueue, useMessageSender, useThrottle } from '@/hooks';
import { useAuthStore } from '@/stores/authStore';
import { useChatInitialization } from '@/hooks/data/useChatInitialization';
import { useCrossTabSync } from '@/hooks/data/useCrossTabSync';
import { usePerfMock, usePerfMockEnabled } from '@/hooks/data/usePerfMock';
import { CONVERSATION_SEND_LOCK_ERROR_CODE } from '@/utils/events/conversationSendLock';
import type { MessageListHandle } from '@/types/message';
import styles from './ChatInterface.module.css';

const ConversationListLazy = React.lazy(() => import('./ConversationList'));
const SettingsPanelLazy = React.lazy(() => import('./SettingsPanel'));

const ConversationSidebarPlaceholder: React.FC = () => (
  <div
    className="conversation-sidebar conversation-sidebar--placeholder expanded"
    aria-hidden="true"
  />
);

const ChatInterface: React.FC = () => {
  const { t } = useTranslation();

  // ===== Zustand Stores =====
  const messages = useChatStore((s) => s.messages);
  const conversationId = useChatStore((s) => s.conversationId);
  const userId = useChatStore((s) => s.userId);
  const firstItemIndex = useChatStore((s) => s.firstItemIndex);
  const hasMoreMessages = useChatStore((s) => s.hasMoreMessages);
  const isLoadingMore = useChatStore((s) => s.isLoadingMore);
  const loadOlderMessages = useChatStore((s) => s.loadOlderMessages);
  const unreadConversationIds = useChatStore((s) => s.unreadConversationIds);

  const isLoading = useUIStore((s) => s.isLoading);
  const chatMode = useUIStore((s) => s.chatMode);
  const setLoading = useUIStore((s) => s.setLoading);
  const setChatMode = useUIStore((s) => s.setChatMode);

  const authLoggedIn = useAuthStore((s) => s.loggedIn);
  const canUseMultiAgent = useAuthStore((s) => s.canUseMultiAgent);
  const beginLogin = useAuthStore((s) => s.beginLogin);
  const logout = useAuthStore((s) => s.logout);

  // ===== 本地 UI 状态 =====
  const [inputValue, setInputValue] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const listRef = useRef<MessageListHandle>(null);
  const thinkingEndRef = useRef<HTMLDivElement>(null);
  const messageCountRefs = useRef<Map<string, HTMLElement>>(new Map());

  const perfMockEnabled = usePerfMockEnabled();

  // ===== 提取的 Hooks =====
  useChatInitialization();
  usePerfMock(perfMockEnabled);

  const { sendMessageInternal, retryMessage, abort } = useMessageSender({
    messageCountRefs,
    listRef,
    onConversationCreated: () => {
      conversationManager.loadConversations().catch((err) =>
        console.error('刷新对话列表失败:', err),
      );
    },
  });

  const conversationManager = useConversationManager(userId, () => {
    abort();
    setLoading(false);
  });

  const messageQueue = useMessageQueue({
    onProcessQueue: async () => {},
  });

  // 加载对话列表
  useEffect(() => {
    if (perfMockEnabled) return;
    conversationManager.loadConversations().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, perfMockEnabled]);

  const processQueueOnce = useCallback(async () => {
    if (isLoading || messageQueue.isProcessing || messageQueue.queue.length === 0) return;
    await messageQueue.processMessageQueue(sendMessageInternal);
  }, [isLoading, messageQueue.isProcessing, messageQueue.processMessageQueue, messageQueue.queue.length, sendMessageInternal]);

  useEffect(() => {
    if (messageQueue.waitingLock) return;
    processQueueOnce();
  }, [messageQueue.waitingLock, processQueueOnce]);

  useCrossTabSync({
    loadConversations: () => conversationManager.loadConversations(),
    processQueueOnce,
    waitingLock: messageQueue.waitingLock,
    setWaitingLock: messageQueue.setWaitingLock,
  });

  // ===== 业务逻辑 =====
  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    if (isLoading) {
      messageQueue.addToQueue(inputValue);
      setInputValue('');
      return;
    }

    const messageText = inputValue;
    setInputValue('');
    sendMessageInternal(messageText).catch((error: any) => {
      if (error?.code === CONVERSATION_SEND_LOCK_ERROR_CODE) {
        messageQueue.addToQueue(messageText);
        messageQueue.setWaitingLock({
          userId: error?.lockUserId || userId,
          conversationId: error?.lockConversationId || conversationId || '__new__',
        });
        console.log('📥 当前会话被其他标签页占用，已自动加入队列');
        return;
      }
      console.error('发送消息失败:', error);
    });
  };

  const handleStopGeneration = () => {
    console.log('🛑 停止生成');
    abort();
    setLoading(false);

    if (messageQueue.queue.length > 0) {
      console.log('📤 停止后检查队列...');
      setTimeout(async () => {
        await messageQueue.processMessageQueue(sendMessageInternal);
      }, 500);
    }
  };

  const throttledSendMessage = useThrottle(handleSendMessage, 300);
  const throttledSetChatMode = useThrottle(setChatMode, 500);

  // ===== 渲染 =====
  const displayQueue = messageQueue.queue.filter((item) => item.id !== messageQueue.activeQueueItemId);

  return (
    <div className={styles['chat-interface-refactored']}>
      <Suspense fallback={<ConversationSidebarPlaceholder />}>
        <ConversationListLazy
          conversations={conversationManager.conversations}
          currentConversationId={conversationId}
          unreadConversationIds={unreadConversationIds}
          onSelectConversation={conversationManager.handleSelectConversation}
          onNewConversation={conversationManager.handleNewConversation}
          onDeleteConversation={conversationManager.handleDeleteConversation}
          isLoading={conversationManager.isLoadingConversations}
          messageCountRefs={messageCountRefs}
        />
      </Suspense>

      <ChatLayout
        header={
          <ChatHeader
            title={<h1>{t('app.title')}</h1>}
            controls={
              <HeaderControls
                chatMode={chatMode}
                onModeChange={throttledSetChatMode}
                onSettingsClick={() => setIsSettingsOpen(true)}
                disabled={isLoading}
                loggedIn={authLoggedIn}
                canUseMultiAgent={canUseMultiAgent}
                onDemoLogin={() => beginLogin({ returnTo: window.location.pathname, deviceIdHash: useChatStore.getState().deviceId })}
                onLogout={() => logout()}
              />
            }
          />
        }
        content={
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
        }
        footer={
          <ChatInputArea
            value={inputValue}
            onChange={setInputValue}
            onSend={throttledSendMessage}
            onStop={handleStopGeneration}
            isLoading={isLoading}
            queueLength={displayQueue.length}
            queuedMessages={displayQueue.map((item) => ({ id: item.id, content: item.content }))}
            onStatsWarningClick={() => console.log('超长文本警告点击')}
          />
        }
      />

      {isSettingsOpen && (
        <Suspense fallback={null}>
          <SettingsPanelLazy
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default ChatInterface;
