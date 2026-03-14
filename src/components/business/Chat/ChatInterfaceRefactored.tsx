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

import React, { useState, useRef, useEffect, useCallback, Suspense, startTransition } from 'react';
import { useTranslation } from 'react-i18next';
import MessageListRefactored, { type MessageListRefactoredHandle } from '../Message/MessageListRefactored';
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
import { CONVERSATION_SEND_LOCK_ERROR_CODE } from '../../../utils/events/conversationSendLock';
import { runWhenIdle, cancelIdleTask } from '../../../utils/perf/scheduling';
import { buildMultiAgentPerfMock } from '../../../dev/fixtures/multiAgentPerfFixture';
import './ChatInterfaceRefactored.css';

const ConversationListLazy = React.lazy(() => import('./ConversationList'));
const SettingsPanelLazy = React.lazy(() => import('./SettingsPanel'));

const ConversationSidebarPlaceholder: React.FC = () => (
  <div
    className="conversation-sidebar conversation-sidebar--placeholder expanded"
    aria-hidden="true"
  />
);

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
  const pendingConversationListSyncRef = useRef(false);
  const perfMockInitializedRef = useRef(false);
  const perfMockHydrationTimerRef = useRef<number | null>(null);

  const perfMockEnabled =
    typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('perfMock') === '1'
    && (
      process.env.NODE_ENV === 'development'
      || window.location.hostname === 'localhost'
      || window.location.hostname === '127.0.0.1'
    );

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

  const messageQueue = useMessageQueue({
    onProcessQueue: async () => {}, // 空实现，队列处理由 useEffect 监听 isLoading 自动触发
  });

  // ===== 初始化 =====
  useEffect(() => {
    const idleId = runWhenIdle(() => {
      (async () => {
        const id = await getPrivacyFirstDeviceId();
        setDeviceId(id);
        showPrivacyNotice();
        console.log('🔐 设备 ID（Hash）已生成:', id);
      })();
    }, { timeout: 1200 });

    return () => {
      cancelIdleTask(idleId);
    };
  }, [setDeviceId]);

  useEffect(() => {
    initializeUser(userId);
  }, [userId]);

  // 初始化读取登录态（演示版）
  useEffect(() => {
    const idleId = runWhenIdle(() => {
      refreshMe().catch(() => {});
    }, { timeout: 1500 });

    return () => {
      cancelIdleTask(idleId);
    };
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
    if (perfMockEnabled) return;
    conversationManager.loadConversations().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, perfMockEnabled]); // 只在 userId 变化时重新加载

  useEffect(() => {
    if (!perfMockEnabled) return;
    if (perfMockInitializedRef.current) return;
    perfMockInitializedRef.current = true;

    const { conversationId: mockConversationId, messages: mockMessages } = buildMultiAgentPerfMock();
    const latestMultiAgentMessage = [...mockMessages].reverse().find((item) => Boolean(item.multiAgentData));
    const eagerMessages = latestMultiAgentMessage
      ? [...mockMessages.slice(0, 5), latestMultiAgentMessage]
      : mockMessages.slice(0, 6);

    // 先注入轻量首屏数据，降低首屏 LCP 的渲染压力。
    useChatStore.setState({
      conversationId: mockConversationId,
      messages: eagerMessages,
      firstItemIndex: 0,
      hasMoreMessages: false,
      totalMessages: mockMessages.length,
      isLoadingMore: false,
    });

    const idleId = runWhenIdle(() => {
      perfMockHydrationTimerRef.current = window.setTimeout(() => {
        startTransition(() => {
          useChatStore.setState({
            conversationId: mockConversationId,
            messages: mockMessages,
            firstItemIndex: 0,
            hasMoreMessages: false,
            totalMessages: mockMessages.length,
            isLoadingMore: false,
          });
        });
      }, 400);
    }, { timeout: 2500 });

    setLoading(false);
    console.log(
      `[PerfMock] 首屏先注入 ${eagerMessages.length} 条轻量消息，空闲时补齐到 ${mockMessages.length} 条。`
    );

    return () => {
      cancelIdleTask(idleId);
      if (perfMockHydrationTimerRef.current !== null) {
        window.clearTimeout(perfMockHydrationTimerRef.current);
        perfMockHydrationTimerRef.current = null;
      }
    };
  }, [perfMockEnabled, setLoading]);

  const processQueueOnce = useCallback(async () => {
    if (isLoading || messageQueue.isProcessing || messageQueue.queue.length === 0) return;
    await messageQueue.processMessageQueue(sendMessageInternal);
  }, [isLoading, messageQueue.isProcessing, messageQueue.processMessageQueue, messageQueue.queue.length, sendMessageInternal]);

  // ✅ 队列自动处理：空闲且未被锁阻塞时，尝试处理一次
  useEffect(() => {
    if (messageQueue.waitingLock) return;
    processQueueOnce();
  }, [messageQueue.waitingLock, processQueueOnce]);

  const throttledLoadConversations = useThrottle(() => {
    conversationManager.loadConversations().catch((error) => {
      console.error('跨 tab 刷新对话列表失败:', error);
    });
  }, 1000);

  // 跨 tab 消息更新通知：当前会话轻量刷新，非当前会话标记红点
  useEffect(() => {
    const unsubscribe = subscribeCrossTabEvents((event) => {
      if (event.type === 'conversation_list_updated') {
        // 参考 ChatGPT 一类产品的常见交互：流式生成期间不打断侧栏交互，延后列表同步
        pendingConversationListSyncRef.current = true;
        if (!isLoading) {
          throttledLoadConversations();
          pendingConversationListSyncRef.current = false;
        }
        return;
      }

      if (event.type === 'conversation_send_released') {
        const waitingLock = messageQueue.waitingLock;
        if (!waitingLock) return;
        if (
          waitingLock.userId === event.userId
          && waitingLock.conversationId === event.conversationId
        ) {
          messageQueue.setWaitingLock(null);
          processQueueOnce();
        }
        return;
      }

      if (event.type !== 'conversation_updated') return;

      if (event.conversationId !== conversationId) {
        markConversationUnread(event.conversationId);
      }
    });

    return () => unsubscribe();
  }, [
    clearConversationUnread,
    conversationId,
    markConversationUnread,
    messageQueue.waitingLock,
    messageQueue.setWaitingLock,
    processQueueOnce,
    isLoading,
    throttledLoadConversations,
  ]);

  // 流式结束后补一次会话列表同步，避免生成过程中频繁刷新侧栏
  useEffect(() => {
    if (isLoading) return;
    if (!pendingConversationListSyncRef.current) return;
    throttledLoadConversations();
    pendingConversationListSyncRef.current = false;
  }, [isLoading, throttledLoadConversations]);

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
    (() => {
      const displayQueue = messageQueue.queue.filter((item) => item.id !== messageQueue.activeQueueItemId);
      return (
    <ChatInputArea
      value={inputValue}
      onChange={setInputValue}
      onSend={throttledSendMessage}
      onStop={handleStopGeneration}
      isLoading={isLoading}
      queueLength={displayQueue.length}
      queuedMessages={displayQueue.map((item) => ({
        id: item.id,
        content: item.content,
      }))}
      onStatsWarningClick={() => {
        console.log('超长文本警告点击');
      }}
    />
      );
    })()
  );

  return (
    <div className="chat-interface-refactored">
      {/* 对话列表 */}
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

      {/* 聊天区域 - 使用重构后的布局 */}
      <ChatLayout
        header={headerContent}
        content={mainContent}
        footer={footerContent}
      />

      {/* 设置面板 */}
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

export default ChatInterfaceRefactored;

