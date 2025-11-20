import React, { useState, useRef, useEffect } from 'react';
import StreamingMarkdown from './StreamingMarkdown';
import ConversationList from './ConversationList';
import { getUserId, initializeUser } from '../utils/userManager';
import {
  getConversations,
  createConversation,
  getConversationMessages,
  deleteConversation,
  getConversationDetails,
  Conversation,
} from '../utils/conversationAPI';
import './ChatInterface.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string; // thinking 内容
  timestamp: number;
}

const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [modelType, setModelType] = useState<'local' | 'volcano'>('local');
  const [userId] = useState<string>(getUserId()); // 获取或生成 userId
  const [conversationId, setConversationId] = useState<string | null>(null); // 当前对话 ID
  const [conversations, setConversations] = useState<Conversation[]>([]); // 对话列表
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const thinkingEndRef = useRef<HTMLDivElement>(null); // thinking 区域底部锚点
  const messageCountRefs = useRef<Map<string, HTMLElement>>(new Map()); // 存储每个对话的消息计数 DOM 元素

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    // 先滚动 thinking 区域（如果存在）
    if (thinkingEndRef.current) {
      const thinkingContainer = thinkingEndRef.current.closest('.thinking-content');
      if (thinkingContainer) {
        thinkingContainer.scrollTop = thinkingContainer.scrollHeight;
      }
    }
    // 然后滚动整个消息区域到底部
    scrollToBottom();
  }, [messages]);//注意：这里的思考区域滚动会干扰消息区域的滚动，所以需要分开处理。我们首先滚动 thinking 区域，然后再滚动整个消息区域。
  //至于thinking区域滚动到最底部，我们使用了一个锚点（.thinking-anchor），它是一个不可见的 div，用于触发滚动操作。

  // 初始化用户
  useEffect(() => {
    initializeUser(userId);
  }, [userId]);

  // 加载对话列表
  const loadConversations = async () => {
    setIsLoadingConversations(true);
    try {
      const convs = await getConversations(userId);
      setConversations(convs);
      
      // 如果有对话但没有选中的，自动选中最新的
      if (convs.length > 0 && !conversationId) {
        const latest = convs[0];
        setConversationId(latest.conversationId);
        await loadConversationMessages(latest.conversationId);
      }
    } catch (error) {
      console.error('加载对话列表失败:', error);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  // 加载指定对话的历史消息
  const loadConversationMessages = async (convId: string) => {
    try {
      console.log('🔄 开始加载对话消息:', { userId, convId });
      const msgs = await getConversationMessages(userId, convId);
      console.log('📦 收到消息数据:', msgs);
      console.log('📊 消息数量:', msgs.length);
      
      // 转换消息格式
      const formattedMessages: Message[] = msgs.map((msg) => ({
        id: msg.messageId,
        role: msg.role,
        content: msg.content,
        thinking: msg.thinking,
        timestamp: new Date(msg.timestamp).getTime(),
      }));
      
      console.log('✅ 格式化后的消息:', formattedMessages);
      setMessages(formattedMessages);
    } catch (error) {
      console.error('❌ 加载消息失败:', error);
      setMessages([]);
    }
  };

  // 初始加载对话列表
  useEffect(() => {
    loadConversations();
  }, [userId]);

  // 保存消息到本地存储（向后兼容）
  const saveMessages = (newMessages: Message[]) => {
    if (conversationId) {
      localStorage.setItem(`chat_${conversationId}`, JSON.stringify(newMessages));
    }
  };

  // 新建对话
  const handleNewConversation = async () => {
    const newConv = await createConversation(userId, `对话 ${conversations.length + 1}`);
    if (newConv) {
      setConversations([newConv, ...conversations]);
      setConversationId(newConv.conversationId);
      setMessages([]);
    }
  };

  // 切换对话
  const handleSelectConversation = async (convId: string) => {
    console.log('🔀 切换对话:', { from: conversationId, to: convId });
    if (convId === conversationId) {
      console.log('⚠️ 已经是当前对话，跳过');
      return;
    }
    setConversationId(convId);
    await loadConversationMessages(convId);
  };

  // 删除对话
  const handleDeleteConversation = async (convId: string) => {
    const success = await deleteConversation(userId, convId);
    if (success) {
      const updatedConvs = conversations.filter((c) => c.conversationId !== convId);
      setConversations(updatedConvs);
      
      // 如果删除的是当前对话，切换到第一个对话或清空
      if (convId === conversationId) {
        if (updatedConvs.length > 0) {
          setConversationId(updatedConvs[0].conversationId);
          await loadConversationMessages(updatedConvs[0].conversationId);
        } else {
          setConversationId(null);
          setMessages([]);
        }
      }
    }
  };

  // 发送消息
  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    saveMessages(updatedMessages);
    setInputValue('');
    setIsLoading(true);

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();

    // 创建助手消息占位符
    const assistantMessageId = (Date.now() + 1).toString();

    try {
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      setMessages([...updatedMessages, assistantMessage]);

      // 使用 SSE 接收流式响应
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputValue,
          modelType: modelType,
          userId: userId,
          conversationId: conversationId,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error('请求失败');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentContent = '';
      let currentThinking = '';
      let isDone = false;

      if (!reader) {
        throw new Error('无法读取响应流');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后一个不完整的行

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            
            if (data === '[DONE]') {
              isDone = true;
              break;
            }

            try {
              const parsed = JSON.parse(data);
              console.log('接收到 SSE 数据:', parsed); // 调试日志
              
              // 处理初始化消息（包含 conversationId）
              if (parsed.type === 'init' && parsed.conversationId) {
                console.log('收到 conversationId:', parsed.conversationId);
                // 如果当前没有 conversationId，说明是新建的对话
                if (!conversationId) {
                  setConversationId(parsed.conversationId);
                  // 重新加载对话列表
                  loadConversations();
                }
                continue;
              }
              
              // 处理 thinking 和 content
              if (parsed.thinking !== undefined && parsed.thinking !== null) {
                currentThinking = parsed.thinking;
                console.log('更新 thinking:', currentThinking.substring(0, 50));
              }
              if (parsed.content !== undefined && parsed.content !== null) {
                currentContent = parsed.content;
                console.log('更新 content:', currentContent.substring(0, 50));
              }

              // 实时更新消息（打字机效果）
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? {
                        ...msg,
                        content: currentContent,
                        thinking: currentThinking || undefined,
                      }
                    : msg
                )
              );
            } catch (error) {
              console.error('解析 SSE 数据失败:', error, '数据:', data);
            }
          }
        }
        
        if (isDone) break;
      }

      // 确保最终消息已保存
      console.log('流结束，最终内容:', { content: currentContent, thinking: currentThinking });
      setMessages((prev) => {
        const final = prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: currentContent || '模型未返回内容',
                thinking: currentThinking || undefined,
              }
            : msg
        );
        saveMessages(final);
        
        // 实时更新对话列表中的消息计数（从服务器获取最新值）
        if (conversationId) {
          // 异步获取最新的对话详情
          getConversationDetails(userId, conversationId).then((details: Conversation | null) => {
            if (details) {
              const countElement = messageCountRefs.current.get(conversationId);
              if (countElement) {
                countElement.textContent = `${details.messageCount}`;
              }
            }
          }).catch((error: unknown) => {
            console.error('更新消息计数失败:', error);
          });
        }
        
        return final;
      });
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('请求已取消');
      } else {
        console.error('发送消息失败:', error);
        setMessages((prev) => {
          const msg = prev.find((m) => m.id === assistantMessageId);
          if (msg) {
            return prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: '发送消息失败，请重试' }
                : m
            );
          }
          return prev;
        });
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  // 停止生成
  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  };

  // 清空当前对话
  const clearHistory = async () => {
    if (!conversationId) return;
    
    if (window.confirm('确定要清空当前对话的聊天记录吗？')) {
      // 删除当前对话并创建新对话
      await handleDeleteConversation(conversationId);
      await handleNewConversation();
    }
  };

  return (
    <div className="app-container">
      <ConversationList
        conversations={conversations}
        currentConversationId={conversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        isLoading={isLoadingConversations}
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
          <button onClick={clearHistory} className="clear-btn">
            清空历史
          </button>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <p>开始与 AI 兴趣教练对话吧！</p>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`}
          >
            <div className="message-content">
              {message.role === 'assistant' && message.thinking && (
                <div className="thinking-content">
                  <div className="thinking-label">思考过程：</div>
                  <div className="thinking-text">
                    {message.thinking}
                    <div ref={thinkingEndRef} className="thinking-anchor" />
                  </div>
                </div>
              )}
              <div className="message-text">
                {message.content ? (
                  message.role === 'assistant' ? (
                    <StreamingMarkdown content={message.content} />
                  ) : (
                    message.content
                  )
                ) : (
                  message.role === 'assistant' && !message.thinking ? '正在思考...' : null
                )}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message assistant-message">
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
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
            placeholder="输入你的问题..."
            disabled={isLoading}
            rows={1}
            className="chat-input"
          />
          {isLoading ? (
            <button onClick={stopGeneration} className="send-btn stop-btn">
              停止
            </button>
          ) : (
            <button onClick={sendMessage} className="send-btn" disabled={!inputValue.trim()}>
              发送
            </button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default ChatInterface;

