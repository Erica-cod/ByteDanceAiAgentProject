import { useState, useRef } from 'react';
import {
  getConversations,
  createConversation,
  deleteConversation,
  type Conversation,
} from '../../utils/conversationAPI';
import { useChatStore } from '../../stores';

export function useConversationManager(userId: string, onAbort: () => void) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const shouldScrollToBottomRef = useRef(false);

  const setConversationId = useChatStore((s) => s.setConversationId);
  const loadConversation = useChatStore((s) => s.loadConversation);

  // 加载对话列表
  const loadConversations = async () => {
    setIsLoadingConversations(true);
    try {
      const convs = await getConversations(userId);
      setConversations(convs);

      const conversationId = useChatStore.getState().conversationId;
      if (convs.length > 0 && !conversationId) {
        const latest = convs[0];
        setConversationId(latest.conversationId);
        await loadConversation(latest.conversationId);
      }
    } catch (error) {
      console.error('加载对话列表失败:', error);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  // 新建对话
  const handleNewConversation = async () => {
    onAbort();

    const newConv = await createConversation(userId, `对话 ${conversations.length + 1}`);
    if (newConv) {
      setConversations([newConv, ...conversations]);
      setConversationId(newConv.conversationId);
      useChatStore.setState({
        messages: [],
        firstItemIndex: 0,
        hasMoreMessages: false,
        totalMessages: 0,
      });
    }
  };

  // 切换对话
  const handleSelectConversation = async (convId: string) => {
    const currentConvId = useChatStore.getState().conversationId;
    console.log('🔀 切换对话:', { from: currentConvId, to: convId });
    
    if (convId === currentConvId) {
      console.log('⚠️ 已经是当前对话，跳过');
      return;
    }

    onAbort();

    setConversationId(convId);
    await loadConversation(convId);
    shouldScrollToBottomRef.current = true;
  };

  // 删除对话
  const handleDeleteConversation = async (convId: string) => {
    const success = await deleteConversation(userId, convId);
    if (success) {
      const updatedConvs = conversations.filter((c) => c.conversationId !== convId);
      setConversations(updatedConvs);

      const currentConvId = useChatStore.getState().conversationId;
      if (convId === currentConvId) {
        if (updatedConvs.length > 0) {
          setConversationId(updatedConvs[0].conversationId);
          await loadConversation(updatedConvs[0].conversationId);
        } else {
          setConversationId(null);
          useChatStore.setState({
            messages: [],
            firstItemIndex: 0,
            hasMoreMessages: false,
            totalMessages: 0,
          });
        }
      }
    }
  };

  // 清空当前对话
  const clearHistory = async () => {
    const conversationId = useChatStore.getState().conversationId;
    if (!conversationId) return;

    if (window.confirm('确定要清空当前对话的聊天记录吗？')) {
      await handleDeleteConversation(conversationId);
      await handleNewConversation();
    }
  };

  return {
    conversations,
    isLoadingConversations,
    shouldScrollToBottomRef,
    loadConversations,
    handleNewConversation,
    handleSelectConversation,
    handleDeleteConversation,
    clearHistory,
  };
}

