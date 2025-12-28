import React, { useState, useRef, useEffect } from 'react';
import { type VirtuosoHandle } from 'react-virtuoso';
import ConversationList from './ConversationList';
import MessageList from './MessageList';
import { initializeUser } from '../utils/userManager';
import { getPrivacyFirstDeviceId, showPrivacyNotice } from '../utils/privacyFirstFingerprint';
import { useChatStore, useUIStore } from '../stores';
import { useConversationManager } from '../hooks/useConversationManager';
import { useMessageQueue } from '../hooks/useMessageQueue';
import { useMessageSender } from '../hooks/useMessageSender';
import './ChatInterface.css';

const ChatInterface: React.FC = () => {
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
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const thinkingEndRef = useRef<HTMLDivElement>(null);
  const messageCountRefs = useRef<Map<string, HTMLElement>>(new Map());

  // ===== 自定义 Hooks =====
  const { sendMessageInternal, retryMessage, abort } = useMessageSender({
    messageCountRefs,
    virtuosoRef,
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

  // Thinking 区域自动滚动
  useEffect(() => {
    if (thinkingEndRef.current) {
      const thinkingContainer = thinkingEndRef.current.closest('.thinking-content');
      if (thinkingContainer) {
        thinkingContainer.scrollTop = thinkingContainer.scrollHeight;
      }
    }
  }, [messages]);

  // 切换对话后滚动到底部
  useEffect(() => {
    if (
      conversationManager.shouldScrollToBottomRef.current &&
      messages.length > 0 &&
      virtuosoRef.current
    ) {
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({
          index: messages.length - 1,
          align: 'end',
          behavior: 'smooth',
        });
      });
      conversationManager.shouldScrollToBottomRef.current = false;
    }
  }, [messages, conversationManager.shouldScrollToBottomRef]);

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
          <h1>AI 兴趣教练</h1>
          <div className="header-controls">
            <label className="model-switch">
              <span>模型选择：</span>
              <select
                value={modelType}
                onChange={(e) => setModelType(e.target.value as 'local' | 'volcano')}
                disabled={isLoading}
              >
                <option value="local">本地模型 (Ollama)</option>
                <option value="volcano">火山云模型</option>
              </select>
            </label>
            <label className="mode-switch">
              <span>模式：</span>
              <button
                className={`mode-btn ${chatMode === 'single' ? 'active' : ''}`}
                onClick={() => setChatMode('single')}
                disabled={isLoading}
                title="单Agent模式：快速响应"
              >
                普通
              </button>
              <button
                className={`mode-btn ${chatMode === 'multi_agent' ? 'active' : ''}`}
                onClick={() => setChatMode('multi_agent')}
                disabled={isLoading}
                title="多Agent协作模式：深度规划和分析"
              >
                🧠 Smart AI
              </button>
            </label>
            <button onClick={conversationManager.clearHistory} className="clear-btn">
              清空历史
            </button>
          </div>
        </div>

        <div className="chat-messages">
          <MessageList
            ref={virtuosoRef}
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
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={isLoading ? '当前消息发送中，输入将加入队列...' : '输入你的问题...'}
              disabled={false}
              rows={1}
              className="chat-input"
            />
            {isLoading ? (
              <button onClick={stopGeneration} className="send-btn stop-btn">
                停止
              </button>
            ) : (
              <button onClick={sendMessage} className="send-btn" disabled={!inputValue.trim()}>
                {messageQueue.queue.length > 0 ? `发送 (队列: ${messageQueue.queue.length})` : '发送'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
