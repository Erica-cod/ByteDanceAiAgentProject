// 对话管理 API 工具函数

export interface Conversation {
  _id?: string;
  conversationId: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  isActive: boolean;
}

export interface Message {
  _id?: string;
  messageId: string;
  conversationId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  sources?: Array<{title: string; url: string}>;  // 搜索来源链接
  modelType?: 'local' | 'volcano';
  timestamp: string;
}

/**
 * 获取用户的所有对话列表
 */
export async function getConversations(userId: string): Promise<Conversation[]> {
  try {
    const response = await fetch(`/api/conversations?userId=${userId}`);
    if (!response.ok) {
      throw new Error('获取对话列表失败');
    }
    const data = await response.json();
    return data.success ? data.data.conversations : [];
  } catch (error) {
    console.error('获取对话列表失败:', error);
    return [];
  }
}

/**
 * 创建新对话
 */
export async function createConversation(userId: string, title?: string): Promise<Conversation | null> {
  try {
    const response = await fetch('/api/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        title: title || '新对话',
      }),
    });
    
    if (!response.ok) {
      throw new Error('创建对话失败');
    }
    
    const data = await response.json();
    return data.success ? data.data.conversation : null;
  } catch (error) {
    console.error('创建对话失败:', error);
    return null;
  }
}

/**
 * 获取单个对话的详细信息（包含最新的 messageCount）
 */
export async function getConversationDetails(
  userId: string,
  conversationId: string
): Promise<Conversation | null> {
  try {
    const response = await fetch(`/api/conversations/${conversationId}?userId=${userId}`);
    if (!response.ok) {
      throw new Error('获取对话详情失败');
    }
    const data = await response.json();
    return data.success ? data.data.conversation : null;
  } catch (error) {
    console.error('获取对话详情失败:', error);
    return null;
  }
}

/**
 * 获取对话的所有消息
 */
export async function getConversationMessages(
  userId: string,
  conversationId: string
): Promise<Message[]> {
  try {
    console.log('🌐 API 调用: GET /api/conversations/' + conversationId, { userId });
    const response = await fetch(`/api/conversations/${conversationId}?userId=${userId}`);
    console.log('📡 API 响应状态:', response.status, response.statusText);
    
    if (!response.ok) {
      throw new Error('获取消息失败');
    }
    
    const data = await response.json();
    console.log('📦 API 返回数据:', data);
    
    const messages = data.success ? data.data.messages : [];
    console.log('💬 提取的消息列表:', messages);
    
    return messages;
  } catch (error) {
    console.error('❌ 获取消息失败:', error);
    return [];
  }
}

/**
 * 删除对话
 */
export async function deleteConversation(
  userId: string,
  conversationId: string
): Promise<boolean> {
  try {
    const response = await fetch(`/api/conversations/${conversationId}?userId=${userId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error('删除对话失败');
    }
    
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('删除对话失败:', error);
    return false;
  }
}

/**
 * 更新对话标题
 */
export async function updateConversationTitle(
  userId: string,
  conversationId: string,
  newTitle: string
): Promise<boolean> {
  try {
    const response = await fetch(`/api/conversations/${conversationId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        title: newTitle,
      }),
    });
    
    if (!response.ok) {
      throw new Error('更新标题失败');
    }
    
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('更新标题失败:', error);
    return false;
  }
}

