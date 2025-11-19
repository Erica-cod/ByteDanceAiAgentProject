import React, { useState, useRef, useEffect } from 'react';
import StreamingMarkdown from './StreamingMarkdown';
import { getUserId, initializeUser } from '../utils/userManager';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 初始化用户
  useEffect(() => {
    initializeUser(userId);
  }, [userId]);

  // 从本地存储加载历史记录（临时保留，后续会从数据库加载）
  useEffect(() => {
    const savedMessages = localStorage.getItem('chatHistory');
    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages));
      } catch (error) {
        console.error('加载历史记录失败:', error);
      }
    }
  }, []);

  // 保存消息到本地存储
  const saveMessages = (newMessages: Message[]) => {
    localStorage.setItem('chatHistory', JSON.stringify(newMessages));
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

  // 清空历史
  const clearHistory = () => {
    if (window.confirm('确定要清空聊天记录吗？')) {
      setMessages([]);
      localStorage.removeItem('chatHistory');
    }
  };

  return (
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
                  <div className="thinking-text">{message.thinking}</div>
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
  );
};

export default ChatInterface;

