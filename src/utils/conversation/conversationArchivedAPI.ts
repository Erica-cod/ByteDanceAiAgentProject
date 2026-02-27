/**
 * 归档对话 API 调用函数
 */

import { fetchWithCsrf } from '../auth/fetchWithCsrf';

export interface ArchivedConversation {
  _id?: string;
  conversationId: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date;
  messageCount: number;
  isArchived: boolean;
}

export interface ArchivedConversationsResponse {
  conversations: ArchivedConversation[];
  total: number;
}

/**
 * 获取用户的归档对话列表
 */
export async function getArchivedConversations(
  userId: string,
  limit: number = 20,
  skip: number = 0
): Promise<ArchivedConversationsResponse> {
  try {
    const response = await fetch(
      `/api/conversations/archived?userId=${userId}&limit=${limit}&skip=${skip}`
    );

    if (!response.ok) {
      throw new Error('获取归档对话失败');
    }

    const data = await response.json();
    if (data.success) {
      return data.data;
    } else {
      throw new Error(data.error || '获取归档对话失败');
    }
  } catch (error) {
    console.error('❌ 获取归档对话失败:', error);
    return { conversations: [], total: 0 };
  }
}

/**
 * 恢复归档的对话
 */
export async function restoreArchivedConversation(
  conversationId: string,
  userId: string
): Promise<boolean> {
  try {
    const response = await fetchWithCsrf('/api/conversations/archived/restore', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId,
        userId,
      }),
    });

    if (!response.ok) {
      throw new Error('恢复对话失败');
    }

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('❌ 恢复对话失败:', error);
    return false;
  }
}

