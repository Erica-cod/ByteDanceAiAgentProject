import React, { useState, useRef, useEffect } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import StreamingMarkdown from './StreamingMarkdown';
import ConversationList from './ConversationList';
import MultiAgentDisplay, { type RoundData, type AgentOutput as MAAgentOutput, type HostDecision as MAHostDecision } from './MultiAgentDisplay';
import { getUserId, initializeUser } from '../utils/userManager';
import {
  getConversations,
  createConversation,
  getConversationMessages,
  deleteConversation,
  getConversationDetails,
  Conversation,
} from '../utils/conversationAPI';
import {
  readConversationCache,
  writeConversationCache,
  mergeServerMessagesWithCache,
  type CachedMessage,
} from '../utils/conversationCache';
import './ChatInterface.css';

interface Message {
  id: string;
  clientMessageId?: string; // 服务端回传：用于本地缓存与服务端消息精确对齐
  role: 'user' | 'assistant';
  content: string;
  thinking?: string; // thinking 内容
  sources?: Array<{title: string; url: string}>; // 搜索来源链接
  timestamp: number;
  pendingSync?: boolean; // 本地临时消息：还未确认已被服务端持久化
  multiAgentData?: {  // 新增：多agent数据
    rounds: RoundData[];
    status: 'in_progress' | 'converged' | 'terminated';
    consensusTrend: number[];
  };
}

// 来源链接组件
const SourceLinks: React.FC<{ sources: Array<{title: string; url: string}> }> = ({ sources }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="source-links-container">
      <button 
        className="source-links-toggle" 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="source-icon">🔗</span>
        <span className="source-text">来源链接 ({sources.length})</span>
        <span className={`source-arrow ${isExpanded ? 'expanded' : ''}`}>▼</span>
      </button>
      {isExpanded && (
        <div className="source-links-list">
          {sources.map((source, index) => (
            <a
              key={index}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="source-link-item"
            >
              <span className="source-number">{index + 1}</span>
              <span className="source-title">{source.title}</span>
              <span className="source-external">↗</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [modelType, setModelType] = useState<'local' | 'volcano'>('local');
  const [chatMode, setChatMode] = useState<'single' | 'multi_agent'>('single'); // 新增：聊天模式
  const [userId] = useState<string>(getUserId()); // 获取或生成 userId
  const [conversationId, setConversationId] = useState<string | null>(null); // 当前对话 ID
  const [conversations, setConversations] = useState<Conversation[]>([]); // 对话列表
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const thinkingEndRef = useRef<HTMLDivElement>(null); // thinking 区域底部锚点
  const messageCountRefs = useRef<Map<string, HTMLElement>>(new Map()); // 存储每个对话的消息计数 DOM 元素

  useEffect(() => {
    // 先滚动 thinking 区域（如果存在）
    if (thinkingEndRef.current) {
      const thinkingContainer = thinkingEndRef.current.closest('.thinking-content');
      if (thinkingContainer) {
        thinkingContainer.scrollTop = thinkingContainer.scrollHeight;
      }
    }
    // 全局滚动交给 Virtuoso 的 followOutput 处理（只在用户位于底部时自动跟随）
  }, [messages]);//注意：这里的思考区域滚动会干扰消息区域的滚动，所以需要分开处理。
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

      // 1) 先读本地缓存，做到“秒开”
      const cached = readConversationCache(convId);
      if (cached.length > 0) {
        const cachedMessages: Message[] = cached.map((m) => ({
          id: m.id,
          clientMessageId: m.clientMessageId,
          role: m.role,
          content: m.content,
          thinking: m.thinking,
          sources: m.sources as any,
          timestamp: m.timestamp,
          pendingSync: m.pendingSync,
        }));
        setMessages(cachedMessages);
      }

      // 2) 再拉服务端权威数据并对齐回写
      const msgs = await getConversationMessages(userId, convId);
      console.log('📦 收到消息数据:', msgs);
      console.log('📊 消息数量:', msgs.length);
      
      // 转换消息格式
      const formattedMessages: Message[] = msgs.map((msg) => ({
        id: msg.messageId,
        role: msg.role,
        content: msg.content,
        thinking: msg.thinking,
        sources: msg.sources,  // 保留搜索来源链接
        timestamp: new Date(msg.timestamp).getTime(),
      }));
      
      console.log('✅ 格式化后的消息:', formattedMessages);
      console.log('🔗 有 sources 的消息数量:', formattedMessages.filter(m => m.sources && m.sources.length > 0).length);
      
      // 打印每条有 sources 的消息
      formattedMessages.forEach((msg, index) => {
        if (msg.sources && msg.sources.length > 0) {
          console.log(`📎 前端消息 ${index + 1} 有 sources:`, msg.sources);
        }
      });
      
      const serverForCache: CachedMessage[] = msgs.map((msg) => ({
        id: msg.messageId,
        clientMessageId: msg.clientMessageId,
        role: msg.role,
        content: msg.content,
        thinking: msg.thinking,
        sources: msg.sources as any,
        timestamp: new Date(msg.timestamp).getTime(),
      }));

      // 合并服务端消息 + 本地待同步消息
      const merged = mergeServerMessagesWithCache(serverForCache, cached);

      const mergedForUI: Message[] = merged.map((m) => ({
        id: m.id,
        clientMessageId: m.clientMessageId,
        role: m.role,
        content: m.content,
        thinking: m.thinking,
        sources: m.sources as any,
        timestamp: m.timestamp,
        pendingSync: m.pendingSync,
      }));

      setMessages(mergedForUI);
      writeConversationCache(convId, merged);
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
      const cached: CachedMessage[] = newMessages.map((m) => ({
        id: m.id,
        clientMessageId: m.clientMessageId,
        role: m.role,
        content: m.content,
        thinking: m.thinking,
        sources: m.sources as any,
        timestamp: m.timestamp,
        pendingSync: m.pendingSync,
      }));
      writeConversationCache(conversationId, cached);
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
      id: `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      role: 'user',
      content: inputValue,
      timestamp: Date.now(),
      pendingSync: true,
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    saveMessages(updatedMessages);
    setInputValue('');
    setIsLoading(true);

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();

    // 创建助手消息占位符
    const assistantMessageId = `client_${Date.now() + 1}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        pendingSync: true,
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
          mode: chatMode, // 新增：传递聊天模式
          clientUserMessageId: userMessage.id,
          clientAssistantMessageId: assistantMessageId,
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

      // 多agent模式的状态
      let multiAgentRounds: RoundData[] = [];
      let multiAgentStatus: 'in_progress' | 'converged' | 'terminated' = 'in_progress';
      let multiAgentConsensusTrend: number[] = [];
      let currentRound: RoundData | null = null;

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
                
                // 如果是多agent模式，初始化多agent数据
                if (parsed.mode === 'multi_agent') {
                  console.log('🤖 多Agent模式初始化');
                  multiAgentStatus = 'in_progress';
                }
                continue;
              }
              
              // ========== 多Agent模式事件处理 ==========
              if (chatMode === 'multi_agent') {
                // Agent输出事件
                if (parsed.type === 'agent_output') {
                  console.log(`📤 收到Agent输出: ${parsed.agent} (第${parsed.round}轮)`);
                  
                  // 如果是新的一轮，创建新的round
                  if (!currentRound || currentRound.round !== parsed.round) {
                    if (currentRound) {
                      multiAgentRounds.push(currentRound);
                    }
                    currentRound = {
                      round: parsed.round,
                      outputs: [],
                    };
                  }
                  
                  // 添加agent输出
                  const agentOutput: MAAgentOutput = {
                    agent: parsed.agent,
                    round: parsed.round,
                    output_type: parsed.output_type,
                    content: parsed.content,
                    metadata: parsed.metadata,
                    timestamp: parsed.timestamp,
                  };
                  currentRound.outputs.push(agentOutput);
                  
                  // 如果是Reporter的输出，更新最终内容
                  if (parsed.agent === 'reporter') {
                    currentContent = parsed.content;
                  }
                  
                  // 实时更新多agent数据
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? {
                            ...msg,
                            content: currentContent || '多Agent协作中...',
                            multiAgentData: {
                              rounds: [...multiAgentRounds, currentRound].filter(Boolean) as RoundData[],
                              status: multiAgentStatus,
                              consensusTrend: multiAgentConsensusTrend,
                            },
                          }
                        : msg
                    )
                  );
                  continue;
                }
                
                // Host决策事件
                if (parsed.type === 'host_decision') {
                  console.log(`🎯 收到Host决策: ${parsed.action}`);
                  
                  if (currentRound) {
                    const hostDecision: MAHostDecision = {
                      action: parsed.action,
                      reason: parsed.reason,
                      next_agents: parsed.next_agents,
                      consensus_level: parsed.consensus_level,
                      timestamp: parsed.timestamp,
                    };
                    currentRound.hostDecision = hostDecision;
                    
                    // 更新共识趋势
                    if (parsed.consensus_level !== undefined) {
                      multiAgentConsensusTrend.push(parsed.consensus_level);
                    }
                    
                    // 实时更新
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? {
                              ...msg,
                              multiAgentData: {
                                rounds: [...multiAgentRounds, currentRound].filter(Boolean) as RoundData[],
                                status: multiAgentStatus,
                                consensusTrend: multiAgentConsensusTrend,
                              },
                            }
                          : msg
                      )
                    );
                  }
                  continue;
                }
                
                // 轮次完成事件
                if (parsed.type === 'round_complete') {
                  console.log(`✅ 第 ${parsed.round} 轮完成`);
                  continue;
                }
                
                // 会话完成事件
                if (parsed.type === 'session_complete') {
                  console.log(`🎉 多Agent会话完成，状态: ${parsed.status}`);
                  multiAgentStatus = parsed.status;
                  
                  // 保存最后一轮
                  if (currentRound) {
                    multiAgentRounds.push(currentRound);
                    currentRound = null;
                  }
                  
                  // 最终更新
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? {
                            ...msg,
                            content: currentContent || '多Agent协作完成',
                            multiAgentData: {
                              rounds: multiAgentRounds,
                              status: multiAgentStatus,
                              consensusTrend: multiAgentConsensusTrend,
                            },
                          }
                        : msg
                    )
                  );
                  continue;
                }
                
                // 错误事件
                if (parsed.type === 'error') {
                  console.error('❌ 多Agent错误:', parsed.error);
                  currentContent = `多Agent协作失败: ${parsed.error}`;
                  multiAgentStatus = 'terminated';
                  continue;
                }
              }
              
              // ========== 单Agent模式事件处理 ==========
              // 处理 thinking、content 和 sources
              if (parsed.thinking !== undefined && parsed.thinking !== null) {
                currentThinking = parsed.thinking;
                console.log('更新 thinking:', currentThinking.substring(0, 50));
              }
              if (parsed.content !== undefined && parsed.content !== null) {
                currentContent = parsed.content;
                console.log('更新 content:', currentContent.substring(0, 50));
              }
              
              // 如果有 sources，也需要保存
              let currentSources = parsed.sources;
              if (currentSources) {
                console.log('收到搜索来源:', currentSources.length, '条');
              }

              // 实时更新消息（打字机效果）- 仅单Agent模式
              if (chatMode === 'single') {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          content: currentContent,
                          thinking: currentThinking || undefined,
                          sources: currentSources || msg.sources, // 保留或更新 sources
                        }
                      : msg
                  )
                );
              }
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
          <button onClick={clearHistory} className="clear-btn">
            清空历史
          </button>
        </div>
      </div>

      <div className="chat-messages">
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: '100%' }}
          data={messages}
          computeItemKey={(_index: number, item: Message) => item.id}
          followOutput={(isAtBottom) => (isAtBottom ? 'smooth' : false)}
          components={{
            Scroller: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
              function Scroller(props, ref) {
                return <div {...props} ref={ref} className="chat-messages-scroller" />;
              }
            ),
            EmptyPlaceholder: () => (
              <div className="empty-state empty-state-virtuoso">
                <p>开始与 AI 兴趣教练对话吧！</p>
              </div>
            ),
            Footer: () =>
              isLoading ? (
                <div className="message assistant-message">
                  <div className="message-content">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              ) : null,
          }}
          itemContent={(_, message) => (
            <div
              className={`message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`}
            >
              <div className="message-content">
                {/* 多Agent模式展示 */}
                {message.role === 'assistant' && message.multiAgentData && (
                  <MultiAgentDisplay
                    rounds={message.multiAgentData.rounds}
                    status={message.multiAgentData.status}
                    consensusTrend={message.multiAgentData.consensusTrend}
                  />
                )}

                {/* 单Agent模式展示 */}
                {message.role === 'assistant' && !message.multiAgentData && message.thinking && (
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
                  ) : message.role === 'assistant' && !message.thinking && !message.multiAgentData ? (
                    '正在思考...'
                  ) : null}
                </div>
                {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                  <SourceLinks sources={message.sources} />
                )}
              </div>
            </div>
          )}
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

