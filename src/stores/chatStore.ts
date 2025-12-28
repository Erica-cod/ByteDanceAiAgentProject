import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  readConversationCache,
  writeConversationCache,
  mergeServerMessagesWithCache,
  type CachedMessage,
} from '../utils/conversationCache';
import { getUserId } from '../utils/userManager';
import { getConversationMessages, type Conversation } from '../utils/conversationAPI';

export interface Message {
  id: string;
  clientMessageId?: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  sources?: Array<{ title: string; url: string }>;
  timestamp: number;
  pendingSync?: boolean;
  failed?: boolean; // 标记失败的消息
  retryCount?: number; // 重试次数
  multiAgentData?: {
    rounds: any[];
    status: 'in_progress' | 'converged' | 'terminated';
    consensusTrend: number[];
  };
  streamingAgentContent?: Record<string, string>; // ✅ 新增：流式内容（agentId -> 累积内容）
}

interface ChatState {
  // 状态
  messages: Message[];
  conversations: Conversation[];
  conversationId: string | null;
  userId: string;
  deviceId: string; // ✅ 新增：设备指纹 ID（用于并发控制）
  firstItemIndex: number; // Virtuoso 分页索引
  hasMoreMessages: boolean;
  totalMessages: number;
  isLoadingMore: boolean;

  // 同步 Actions
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  removeMessage: (id: string) => void;
  setConversationId: (id: string | null) => void;
  setDeviceId: (deviceId: string) => void; // ✅ 新增
  setConversations: (conversations: Conversation[]) => void;
  setFirstItemIndex: (index: number) => void;
  setHasMoreMessages: (has: boolean) => void;
  setTotalMessages: (total: number) => void;
  setIsLoadingMore: (loading: boolean) => void;

  // 流式更新优化（关键性能优化）
  appendToLastMessage: (contentDelta?: string, thinkingDelta?: string, sources?: Array<{ title: string; url: string }>) => void;
  markMessageFailed: (id: string) => void;
  markMessageSuccess: (id: string) => void;

  // 异步 Actions
  loadConversation: (convId: string) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  saveToCache: () => void;
}

export const useChatStore = create<ChatState>()(
  immer((set, get) => ({
    // 初始状态
    messages: [],
    conversations: [],
    conversationId: null,
    userId: getUserId(),
    deviceId: '', // ✅ 初始为空，ChatInterface 异步加载后设置
    firstItemIndex: 0,
    hasMoreMessages: false,
    totalMessages: 0,
    isLoadingMore: false,

    // 同步 Actions
    setMessages: (messages) => set({ messages }),

    addMessage: (message) =>
      set((state) => {
        state.messages.push(message);
      }),

    updateMessage: (id, updates) =>
      set((state) => {
        const msg = state.messages.find((m) => m.id === id);
        if (msg) Object.assign(msg, updates);
      }),

    removeMessage: (id) =>
      set((state) => {
        state.messages = state.messages.filter((m) => m.id !== id);
      }),

    setConversationId: (id) => set({ conversationId: id }),
    setDeviceId: (deviceId) => set({ deviceId }), // ✅ 新增
    setConversations: (conversations) => set({ conversations }),
    setFirstItemIndex: (index) => set({ firstItemIndex: index }),
    setHasMoreMessages: (has) => set({ hasMoreMessages: has }),
    setTotalMessages: (total) => set({ totalMessages: total }),
    setIsLoadingMore: (loading) => set({ isLoadingMore: loading }),

    // 流式更新优化（性能关键）
    appendToLastMessage: (contentDelta, thinkingDelta, sources) =>
      set((state) => {
        const last = state.messages[state.messages.length - 1];
        if (last && last.role === 'assistant') {
          if (contentDelta !== undefined) {
            last.content = contentDelta; // 直接赋值（SSE 已经是累积的）
          }
          if (thinkingDelta !== undefined) {
            last.thinking = thinkingDelta;
          }
          if (sources !== undefined) {
            last.sources = sources;
          }
        }
      }),

    markMessageFailed: (id) =>
      set((state) => {
        const msg = state.messages.find((m) => m.id === id);
        if (msg) {
          msg.failed = true;
          msg.retryCount = (msg.retryCount || 0) + 1;
          msg.pendingSync = false;
        }
      }),

    markMessageSuccess: (id) =>
      set((state) => {
        const msg = state.messages.find((m) => m.id === id);
        if (msg) {
          msg.failed = false;
          msg.pendingSync = false;
        }
      }),

    // 异步 Actions
    loadConversation: async (convId) => {
      try {
        console.log('从缓存加载对话:', convId);
        const { userId } = get();

        // 1️⃣ 先读本地缓存（秒开）- 复用现有函数
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
          set({
            messages: cachedMessages,
            conversationId: convId,
            firstItemIndex: 0,
          });
        }

        // 2️⃣ 拉服务端数据
        const PAGE_SIZE = 30;
        const result = await getConversationMessages(userId, convId, PAGE_SIZE, 0);
        console.log('首屏消息数据:', result);

        set({ totalMessages: result.total });

        // 计算实际加载的起始位置
        const actualSkip = Math.max(0, result.total - PAGE_SIZE);
        const needLoadMore = result.total > PAGE_SIZE;

        // 如果总消息超过一页，重新拉取最后一页
        const finalResult = needLoadMore
          ? await getConversationMessages(userId, convId, PAGE_SIZE, actualSkip)
          : result;

        console.log('消息统计:', {
          total: result.total,
          loaded: finalResult.messages.length,
          skip: actualSkip,
          hasMore: needLoadMore,
        });

        // 转换消息格式
        const serverForCache: CachedMessage[] = finalResult.messages.map((msg) => ({
          id: msg.messageId,
          clientMessageId: msg.clientMessageId,
          role: msg.role,
          content: msg.content,
          thinking: msg.thinking,
          sources: msg.sources as any,
          timestamp: new Date(msg.timestamp).getTime(),
        }));

        // 3️⃣ 合并服务端 + 本地待同步消息 - 复用现有函数
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

        set({
          messages: mergedForUI,
          conversationId: convId,
          firstItemIndex: actualSkip,
          hasMoreMessages: needLoadMore,
        });

        // 4️⃣ 写回缓存 - 复用现有函数
        writeConversationCache(convId, merged);
      } catch (error) {
        console.error('加载对话失败:', error);
        set({
          messages: [],
          firstItemIndex: 0,
          hasMoreMessages: false,
        });
      }
    },

    loadOlderMessages: async () => {
      const { conversationId, isLoadingMore, hasMoreMessages, messages, totalMessages, userId } = get();
      if (!conversationId || isLoadingMore || !hasMoreMessages) return;

      set({ isLoadingMore: true });

      try {
        const PAGE_SIZE = 30;
        const currentLoaded = messages.length;
        const skip = Math.max(0, totalMessages - currentLoaded - PAGE_SIZE);

        console.log('加载更早消息:', { skip, limit: PAGE_SIZE, currentLoaded, totalMessages });

        const result = await getConversationMessages(userId, conversationId, PAGE_SIZE, skip);

        if (result.messages.length === 0) {
          set({ hasMoreMessages: false, isLoadingMore: false });
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

        set((state) => {
          state.messages = [...olderMessages, ...state.messages];
          state.firstItemIndex = state.firstItemIndex - olderMessages.length;
          state.hasMoreMessages = skip > 0;
        });

        console.log('已加载更早消息:', olderMessages.length, '条，还有更多:', skip > 0);
      } catch (error) {
        console.error('加载更早消息失败:', error);
      } finally {
        set({ isLoadingMore: false });
      }
    },

    // 保存到缓存（调用现有工具）
    saveToCache: () => {
      const { conversationId, messages } = get();
      if (!conversationId) return;

      const cached: CachedMessage[] = messages.map((m) => ({
        id: m.id,
        clientMessageId: m.clientMessageId,
        role: m.role,
        content: m.content,
        thinking: m.thinking,
        sources: m.sources as any,
        timestamp: m.timestamp,
        pendingSync: m.pendingSync,
      }));

      // ✅ 复用现有函数
      writeConversationCache(conversationId, cached);
    },
  }))
);

// 🔥 多窗口同步（监听 storage 事件）
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key?.startsWith('conv_')) {
      const convId = e.key.replace('conv_', '');

      // 如果当前正在看这个对话，自动刷新
      const currentConvId = useChatStore.getState().conversationId;
      if (convId === currentConvId && e.newValue) {
        try {
          const newMessages = JSON.parse(e.newValue) as CachedMessage[];
          const messagesForUI: Message[] = newMessages.map((m) => ({
            id: m.id,
            clientMessageId: m.clientMessageId,
            role: m.role,
            content: m.content,
            thinking: m.thinking,
            sources: m.sources as any,
            timestamp: m.timestamp,
            pendingSync: m.pendingSync,
          }));
          useChatStore.getState().setMessages(messagesForUI);
          console.log('检测到其他标签页更新，已同步消息');
        } catch (err) {
          console.error('同步消息失败:', err);
        }
      }
    }
  });
}

