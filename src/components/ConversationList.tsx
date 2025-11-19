import React, { useState } from 'react';
import { Conversation } from '../utils/conversationAPI';
import './ConversationList.css';

interface ConversationListProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (conversationId: string) => void;
  isLoading?: boolean;
}

const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  isLoading = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 48) {
      return '昨天';
    } else if (diffInHours < 168) {
      return `${Math.floor(diffInHours / 24)}天前`;
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className={`conversation-sidebar ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="sidebar-header">
        <button
          className="toggle-sidebar-btn"
          onClick={() => setIsExpanded(!isExpanded)}
          title={isExpanded ? '收起侧边栏' : '展开侧边栏'}
        >
          {isExpanded ? '◀' : '▶'}
        </button>
        {isExpanded && (
          <>
            <h2>对话列表</h2>
            <button
              className="new-conversation-btn"
              onClick={onNewConversation}
              disabled={isLoading}
              title="新建对话"
            >
              ➕ 新对话
            </button>
          </>
        )}
      </div>

      {isExpanded && (
        <div className="conversations-list">
          {conversations.length === 0 ? (
            <div className="empty-conversations">
              <p>暂无对话</p>
              <p className="hint">点击上方按钮创建新对话</p>
            </div>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.conversationId}
                className={`conversation-item ${
                  conversation.conversationId === currentConversationId ? 'active' : ''
                }`}
                onClick={() => onSelectConversation(conversation.conversationId)}
              >
                <div className="conversation-info">
                  <div className="conversation-title">{conversation.title}</div>
                  <div className="conversation-meta">
                    <span className="message-count">{conversation.messageCount} 条消息</span>
                    <span className="conversation-time">{formatDate(conversation.updatedAt)}</span>
                  </div>
                </div>
                <button
                  className="delete-conversation-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`确定删除对话"${conversation.title}"吗?`)) {
                      onDeleteConversation(conversation.conversationId);
                    }
                  }}
                  title="删除对话"
                >
                  🗑️
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ConversationList;

