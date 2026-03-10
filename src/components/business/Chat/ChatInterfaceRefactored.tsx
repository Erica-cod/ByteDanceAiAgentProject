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
import ConversationList from '../../old-structure/ConversationList';
import MessageListRefactored, { type MessageListRefactoredHandle } from '../Message/MessageListRefactored';
import SettingsPanel from '../../old-structure/SettingsPanel';
import { ChatLayout } from '../../base/Layout';
import { ChatHeader } from '../../base/Layout';
import { HeaderControls } from './HeaderControls';
import { ChatInputArea } from './ChatInputArea';
import { getUserId, initializeUser } from '../../../utils/auth/userManager';
import { getPrivacyFirstDeviceId, showPrivacyNotice } from '../../../utils/device/privacyFirstFingerprint';
import { useChatStore, useUIStore } from '../../../stores';
import { useConversationManager, useMessageQueue, useMessageSender, useThrottle } from '../../../hooks';
import { useAuthStore } from '../../../stores/authStore';
import { subscribeCrossTabEvents } from '../../../utils/events/crossTabChannel';
import './ChatInterfaceRefactored.css';

const ChatInterfaceRefactored: React.FC = () => {
  const { t } = useTranslation();
  
  // ===== Zustand Stores =====
  const messages = useChatStore((s) => s.messages);
  const conversationId = useChatStore((s) => s.conversationId);
  const userId = useChatStore((s) => s.userId);
  const setUserId = useChatStore((s) => s.setUserId);
  const setDeviceId = useChatStore((s) => s.setDeviceId);
  const firstItemIndex = useChatStore((s) => s.firstItemIndex);
  const hasMoreMessages = useChatStore((s) => s.hasMoreMessages);
  const isLoadingMore = useChatStore((s) => s.isLoadingMore);
  const loadOlderMessages = useChatStore((s) => s.loadOlderMessages);
  const loadConversation = useChatStore((s) => s.loadConversation);
  const unreadConversationIds = useChatStore((s) => s.unreadConversationIds);
  const markConversationUnread = useChatStore((s) => s.markConversationUnread);
  const clearConversationUnread = useChatStore((s) => s.clearConversationUnread);

  const isLoading = useUIStore((s) => s.isLoading);
  const modelType = useUIStore((s) => s.modelType);
  const chatMode = useUIStore((s) => s.chatMode);
  const setLoading = useUIStore((s) => s.setLoading);
  const setChatMode = useUIStore((s) => s.setChatMode);

  // ===== 演示登录态（用于多 Agent 解锁） =====
  const authLoggedIn = useAuthStore((s) => s.loggedIn);
  const authUser = useAuthStore((s) => s.user);
  const canUseMultiAgent = useAuthStore((s) => s.canUseMultiAgent);
  const refreshMe = useAuthStore((s) => s.refreshMe);
  const beginLogin = useAuthStore((s) => s.beginLogin);
  const logout = useAuthStore((s) => s.logout);

  // ===== 本地 UI 状态 =====
  const [inputValue, setInputValue] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const listRef = useRef<MessageListRefactoredHandle>(null);
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

  const processQueueRef = useRef<(() => Promise<void>) | null>(null);

  const messageQueue = useMessageQueue({
    onProcessQueue: async () => {}, // 空实现，队列处理由 useEffect 监听 isLoading 自动触发
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

  // 初始化读取登录态（演示版）
  useEffect(() => {
    refreshMe().catch(() => {});
  }, [refreshMe]);

  // 登录用户切换时，同步业务 userId，确保会按账号隔离加载数据
  useEffect(() => {
    const nextUserId = authLoggedIn && authUser?.userId
      ? authUser.userId
      : getUserId();
    if (nextUserId === userId) return;

    setUserId(nextUserId);
    useChatStore.setState({
      conversationId: null,
      messages: [],
      firstItemIndex: 0,
      hasMoreMessages: false,
      totalMessages: 0,
    });
  }, [authLoggedIn, authUser, userId, setUserId]);

  // 未登录时，强制回退到单 Agent（防止用户误处于 multi_agent 状态）
  useEffect(() => {
    if (!canUseMultiAgent && chatMode === 'multi_agent') {
      setChatMode('single');
    }
  }, [canUseMultiAgent, chatMode, setChatMode]);

  useEffect(() => {
    conversationManager.loadConversations().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]); // 只在 userId 变化时重新加载

  // ✅ 监听 isLoading 状态，自动处理队列
  useEffect(() => {
    if (!isLoading && messageQueue.queue.length > 0) {
      console.log('📤 检测到队列有消息，开始处理...');
      const processQueue = async () => {
        await messageQueue.processMessageQueue(sendMessageInternal);
      };
      
      // 延迟500ms，确保 UI 状态稳定
      const timer = setTimeout(() => {
        processQueue();
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [isLoading, messageQueue.queue.length]); // 依赖队列长度和加载状态

  const throttledLoadConversations = useThrottle(() => {
    conversationManager.loadConversations().catch((error) => {
      console.error('跨 tab 刷新对话列表失败:', error);
    });
  }, 1000);

  const throttledReloadConversation = useThrottle((convId: string) => {
    if (isLoading) return;
    loadConversation(convId)
      .then(() => clearConversationUnread(convId))
      .catch((error) => console.error('跨 tab 刷新会话失败:', error));
  }, 1500);

  // 跨 tab 消息更新通知：当前会话轻量刷新，非当前会话标记红点
  useEffect(() => {
    const unsubscribe = subscribeCrossTabEvents((event) => {
      if (event.type === 'conversation_list_updated') {
        throttledLoadConversations();
        return;
      }

      if (event.type !== 'conversation_updated') return;

      if (event.conversationId !== conversationId) {
        markConversationUnread(event.conversationId);
        return;
      }

      throttledReloadConversation(event.conversationId);
    });

    return () => unsubscribe();
  }, [
    clearConversationUnread,
    conversationId,
    markConversationUnread,
    throttledLoadConversations,
    throttledReloadConversation,
  ]);

  // ===== 业务逻辑 =====
  const handleSendMessage = () => {
    if (!inputValue.trim()) return;
    
    // 如果正在加载，加入队列
    if (isLoading) {
      messageQueue.addToQueue(inputValue);
      setInputValue('');
      return;
    }
    
    // 否则，立即发送
    const messageText = inputValue;
    setInputValue('');
    sendMessageInternal(messageText);
  };

  const handleStopGeneration = () => {
    console.log('🛑 停止生成');
    abort();
    setLoading(false);
    
    // ✅ 停止后如果有队列，继续处理
    if (messageQueue.queue.length > 0) {
      console.log('📤 停止后检查队列...');
      setTimeout(async () => {
        await messageQueue.processMessageQueue(sendMessageInternal);
      }, 500);
    }
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
          loggedIn={authLoggedIn}
          canUseMultiAgent={canUseMultiAgent}
          onDemoLogin={() => beginLogin({ returnTo: window.location.pathname, deviceIdHash: useChatStore.getState().deviceId })}
          onLogout={() => logout()}
        />
      }
    />
  );

  // 主内容
  const mainContent = (
    <MessageListRefactored
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
        unreadConversationIds={unreadConversationIds}
        onSelectConversation={conversationManager.handleSelectConversation}
        onNewConversation={conversationManager.handleNewConversation}
        onDeleteConversation={conversationManager.handleDeleteConversation}
        isLoading={conversationManager.isLoadingConversations}
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

