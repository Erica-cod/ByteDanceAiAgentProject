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
  const shouldScrollToBottomRef = useRef(false); // 标记是否需要滚动到底部（用于切换对话后）
  
  // 分页加载状态
  const [firstItemIndex, setFirstItemIndex] = useState(0); // Virtuoso 虚拟索引起点
  const [hasMoreMessages, setHasMoreMessages] = useState(false); // 是否还有更早的消息
  const [isLoadingMore, setIsLoadingMore] = useState(false); // 是否正在加载更早的消息
  const [totalMessages, setTotalMessages] = useState(0); // 服务端总消息数
  const PAGE_SIZE = 30; // 每次加载消息数量

  useEffect(() => {
    // 只滚动 thinking 区域（如果存在）
    if (thinkingEndRef.current) {
      const thinkingContainer = thinkingEndRef.current.closest('.thinking-content');
      if (thinkingContainer) {
        thinkingContainer.scrollTop = thinkingContainer.scrollHeight;
      }
    }
    // 消息列表的滚动完全交给 Virtuoso 的 followOutput 处理
  }, [messages]);//注意：这里的思考区域滚动会干扰消息区域的滚动，所以需要分开处理。
  //至于thinking区域滚动到最底部，我们使用了一个锚点（.thinking-anchor），它是一个不可见的 div，用于触发滚动操作。

  // 监听消息变化，只在标记需要滚动时才执行（避免流式输出时频繁触发）
  useEffect(() => {
    if (shouldScrollToBottomRef.current && messages.length > 0 && virtuosoRef.current) {
      // 使用 requestAnimationFrame 确保 DOM 已渲染且布局稳定
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({
          index: messages.length - 1,
          align: 'end',
          behavior: 'smooth', // 平滑滚动，避免闪烁
        });
      });
      shouldScrollToBottomRef.current = false; // 滚动完成后重置标记
    }
  }, [messages]); // 只依赖 messages，但通过 ref 控制是否执行

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

  // 加载指定对话的历史消息（首屏只加载最新一页）
  const loadConversationMessages = async (convId: string) => {
    try {
      console.log('🔄 开始加载对话消息（首屏）:', { userId, convId });

      // 1) 先读本地缓存，做到"秒开"
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
        setFirstItemIndex(0);
        // 有缓存时立即标记需要滚动
        shouldScrollToBottomRef.current = true;
      }

      // 2) 拉服务端数据：首屏只加载最新 PAGE_SIZE 条
      const result = await getConversationMessages(userId, convId, PAGE_SIZE, 0);
      console.log('📦 首屏消息数据:', result);
      setTotalMessages(result.total);
      
      // 计算实际加载的起始位置
      const actualSkip = Math.max(0, result.total - PAGE_SIZE);
      const needLoadMore = result.total > PAGE_SIZE;
      
      // 如果总消息超过一页，重新拉取最后一页
      const finalResult = needLoadMore
        ? await getConversationMessages(userId, convId, PAGE_SIZE, actualSkip)
        : result;
      
      console.log('📊 消息统计:', { 
        total: result.total, 
        loaded: finalResult.messages.length,
        skip: actualSkip,
        hasMore: needLoadMore 
      });
      
      // 转换消息格式
      const formattedMessages: Message[] = finalResult.messages.map((msg) => ({
        id: msg.messageId,
        role: msg.role,
        content: msg.content,
        thinking: msg.thinking,
        sources: msg.sources,
        timestamp: new Date(msg.timestamp).getTime(),
      }));
      
      const serverForCache: CachedMessage[] = finalResult.messages.map((msg) => ({
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
      // 正确设置 firstItemIndex：如果跳过了前面的消息，索引应该从 actualSkip 开始
      setFirstItemIndex(actualSkip);
      setHasMoreMessages(needLoadMore);
      writeConversationCache(convId, merged);
      // 服务端数据回来后也标记需要滚动（兜底，确保最终位置正确）
      shouldScrollToBottomRef.current = true;
    } catch (error) {
      console.error('❌ 加载消息失败:', error);
      setMessages([]);
      setFirstItemIndex(0);
      setHasMoreMessages(false);
    }
  };

  // 加载更早的消息（向上滚动触发）
  const loadOlderMessages = async () => {
    if (!conversationId || isLoadingMore || !hasMoreMessages) return;

    setIsLoadingMore(true);
    try {
      const currentLoaded = messages.length;
      const skip = Math.max(0, totalMessages - currentLoaded - PAGE_SIZE);
      
      console.log('⬆️ 加载更早消息:', { skip, limit: PAGE_SIZE, currentLoaded, totalMessages });
      
      const result = await getConversationMessages(userId, conversationId, PAGE_SIZE, skip);
      
      if (result.messages.length === 0) {
        setHasMoreMessages(false);
        return;
      }

      // 转换并 prepend 到前面
      const olderMessages: Message[] = result.messages.map((msg) => ({
        id: msg.messageId,
        role: msg.role,
        content: msg.content,
        thinking: msg.thinking,
        sources: msg.sources,
        timestamp: new Date(msg.timestamp).getTime(),
      }));

      setMessages((prev) => [...olderMessages, ...prev]);
      setFirstItemIndex((prev) => prev - olderMessages.length);
      setHasMoreMessages(skip > 0);
      
      console.log('✅ 已加载更早消息:', olderMessages.length, '条，还有更多:', skip > 0);
    } catch (error) {
      console.error('❌ 加载更早消息失败:', error);
    } finally {
      setIsLoadingMore(false);
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
    // ✅ 新建对话前先停止正在进行的生成
    if (abortControllerRef.current) {
      console.log('🛑 新建对话前先中断正在进行的请求');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
    
    const newConv = await createConversation(userId, `对话 ${conversations.length + 1}`);
    if (newConv) {
      setConversations([newConv, ...conversations]);
      setConversationId(newConv.conversationId);
      setMessages([]);
      setFirstItemIndex(0);
      setHasMoreMessages(false);
      setTotalMessages(0);
    }
  };

  // 切换对话
  const handleSelectConversation = async (convId: string) => {
    console.log('🔀 切换对话:', { from: conversationId, to: convId });
    if (convId === conversationId) {
      console.log('⚠️ 已经是当前对话，跳过');
      return;
    }
    
    // ✅ 切换对话前先停止正在进行的生成
    if (abortControllerRef.current) {
      console.log('🛑 切换对话前先中断正在进行的请求');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
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
          setFirstItemIndex(0);
          setHasMoreMessages(false);
          setTotalMessages(0);
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
    // Virtuoso 的 followOutput 会自动滚动到底部

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();

    // 创建助手消息占位符
    const assistantMessageId = `client_${Date.now() + 1}_${Math.random().toString(36).slice(2, 8)}`;
    
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      pendingSync: true,
    };

    // 立即添加助手占位消息
    const messagesWithAssistant = [...updatedMessages, assistantMessage];
    setMessages(messagesWithAssistant);

    // 确保滚动到底部，让 followOutput 能正常工作（流式输出时自动跟随）
    requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({
        index: messagesWithAssistant.length - 1,
        align: 'end',
        behavior: 'smooth',
      });
    });

    // SSE 重连配置
    const MAX_RECONNECT_ATTEMPTS = 3;
    const BASE_RETRY_DELAY_MS = 500; // 基础退避时间
    const MAX_RETRY_DELAY_MS = 5000; // 最大退避时间

    try {

      const requestBody = {
        message: inputValue,
        modelType: modelType,
        userId: userId,
        conversationId: conversationId,
        mode: chatMode, // 新增：传递聊天模式
        clientUserMessageId: userMessage.id,
        clientAssistantMessageId: assistantMessageId,
      };

      // 多agent模式的状态（重连时也要保留）
      let multiAgentRounds: RoundData[] = [];
      let multiAgentStatus: 'in_progress' | 'converged' | 'terminated' = 'in_progress';
      let multiAgentConsensusTrend: number[] = [];
      let currentRound: RoundData | null = null;

      let currentContent = '';
      let currentThinking = '';

      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const computeBackoff = (attempt: number) => {
        const exp = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * Math.pow(2, attempt));
        const jitter = Math.floor(Math.random() * 250);
        return exp + jitter;
      };

      const runStreamOnce = async (): Promise<{ completed: boolean; aborted: boolean; retryAfterMs?: number }> => {
        const signal = abortControllerRef.current?.signal;
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal,
        });

        // 429：尊重 Retry-After 并重试（通常是服务端并发限制）
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const retryAfterSec = retryAfter ? Number.parseInt(retryAfter, 10) : 1;
          return { completed: false, aborted: false, retryAfterMs: Math.max(0, retryAfterSec) * 1000 };
        }

        if (!response.ok) {
          throw new Error(`请求失败: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('无法读取响应流');

        const decoder = new TextDecoder();
        let buffer = '';
        let isDone = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6).trim();

              if (data === '[DONE]') {
                isDone = true;
                break;
              }

              try {
                const parsed = JSON.parse(data);

                // init：同步 conversationId
                if (parsed.type === 'init' && parsed.conversationId) {
                  if (!conversationId) {
                    setConversationId(parsed.conversationId);
                    // ✅ 异步刷新对话列表，不阻塞当前流
                    loadConversations().catch(err => console.error('刷新对话列表失败:', err));
                  }
                  if (parsed.mode === 'multi_agent') {
                    multiAgentStatus = 'in_progress';
                  }
                  continue;
                }

                // ========== 多Agent模式事件处理 ==========
                if (chatMode === 'multi_agent') {
                  if (parsed.type === 'agent_output') {
                    if (!currentRound || currentRound.round !== parsed.round) {
                      if (currentRound) multiAgentRounds.push(currentRound);
                      currentRound = { round: parsed.round, outputs: [] };
                    }

                    const agentOutput: MAAgentOutput = {
                      agent: parsed.agent,
                      round: parsed.round,
                      output_type: parsed.output_type,
                      content: parsed.content,
                      metadata: parsed.metadata,
                      timestamp: parsed.timestamp,
                    };
                    currentRound.outputs.push(agentOutput);

                    if (parsed.agent === 'reporter') {
                      currentContent = parsed.content;
                    }

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

                  if (parsed.type === 'host_decision') {
                    if (currentRound) {
                      const hostDecision: MAHostDecision = {
                        action: parsed.action,
                        reason: parsed.reason,
                        next_agents: parsed.next_agents,
                        consensus_level: parsed.consensus_level,
                        timestamp: parsed.timestamp,
                      };
                      currentRound.hostDecision = hostDecision;
                      if (parsed.consensus_level !== undefined) {
                        multiAgentConsensusTrend.push(parsed.consensus_level);
                      }

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

                  if (parsed.type === 'session_complete') {
                    multiAgentStatus = parsed.status;
                    if (currentRound) {
                      multiAgentRounds.push(currentRound);
                      currentRound = null;
                    }
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

                  if (parsed.type === 'error') {
                    currentContent = `多Agent协作失败: ${parsed.error}`;
                    multiAgentStatus = 'terminated';
                    continue;
                  }
                }

                // ========== 单Agent模式事件处理 ==========
                if (parsed.thinking !== undefined && parsed.thinking !== null) {
                  currentThinking = parsed.thinking;
                }
                if (parsed.content !== undefined && parsed.content !== null) {
                  currentContent = parsed.content;
                }

                const currentSources = parsed.sources;

                if (chatMode === 'single') {
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? {
                            ...msg,
                            content: currentContent,
                            thinking: currentThinking || undefined,
                            sources: currentSources || msg.sources,
                          }
                        : msg
                    )
                  );
                }
              } catch (e) {
                console.error('解析 SSE 数据失败:', e, '数据:', data);
              }
            }

            if (isDone) break;
          }
        } catch (e: any) {
          // 用户手动停止
          if (e?.name === 'AbortError') {
            return { completed: false, aborted: true };
          }
          // 断网/中断：交给外层重试
          return { completed: false, aborted: false };
        }

        // 正常结束：必须收到 [DONE]
        return { completed: isDone, aborted: false };
      };

      // 断线重连：指数退避 + Retry-After
      let attempt = 0;
      while (true) {
        const result = await runStreamOnce();
        if (result.aborted) {
          throw Object.assign(new Error('AbortError'), { name: 'AbortError' });
        }
        if (result.completed) break;

        if (attempt >= MAX_RECONNECT_ATTEMPTS) {
          throw new Error('SSE 连接中断，已达到最大重试次数');
        }

        const waitMs = result.retryAfterMs ?? computeBackoff(attempt);
        console.warn(`⚠️ SSE 中断/限流，准备第 ${attempt + 1} 次重连，等待 ${waitMs}ms`);

        // 给用户一点提示（不覆盖已有内容）
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId && msg.role === 'assistant'
              ? { ...msg, thinking: msg.thinking || '连接中断，正在尝试重连...' }
              : msg
          )
        );

        await sleep(waitMs);
        attempt += 1;
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
                pendingSync: false,
              }
            : msg
        );

        // 用户消息也标记为已同步（服务端按 clientMessageId 幂等入库）
        const finalWithUserSync = final.map((msg) =>
          msg.id === userMessage.id ? { ...msg, pendingSync: false } : msg
        );
        saveMessages(finalWithUserSync);
        
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
        
        return finalWithUserSync;
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
          firstItemIndex={firstItemIndex}
          startReached={loadOlderMessages}
          atTopThreshold={100}
          increaseViewportBy={{ top: 600, bottom: 600 }}
          defaultItemHeight={100}
          computeItemKey={(_index: number, item: Message) => item.id}
          followOutput="smooth"
          components={{
            Header: () =>
              isLoadingMore ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                  加载更早消息中...
                </div>
              ) : hasMoreMessages ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                  向上滚动加载更多
                </div>
              ) : messages.length > 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                  已加载全部消息
                </div>
              ) : null,
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

