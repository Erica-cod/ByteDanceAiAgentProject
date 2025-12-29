import React, { useState } from 'react';
import { Conversation } from '../utils/conversationAPI';
import { useDateFormat, useThrottle } from '../hooks';
import './ConversationList.css';

interface ConversationListProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (conversationId: string) => void;
  isLoading?: boolean;
  messageCountRefs?: React.MutableRefObject<Map<string, HTMLElement>>;
}

// 时间显示组件（使用 useDateFormat hook）
const ConversationTime: React.FC<{ updatedAt: string }> = ({ updatedAt }) => {
  const formattedDate = useDateFormat(updatedAt);
  return <span className="conversation-time">{formattedDate}</span>;
};

const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  isLoading = false,
  messageCountRefs,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // 🔧 节流：防止用户快速切换对话导致频繁加载数据
  const throttledSelectConversation = useThrottle(onSelectConversation, 500);

  // 🔧 节流：防止用户误触创建多个空对话
  const throttledNewConversation = useThrottle(onNewConversation, 1000);

  // 🔧 节流：防止重复删除请求
  const throttledDeleteConversation = useThrottle(onDeleteConversation, 1000);

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
              onClick={throttledNewConversation}
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
                onClick={() => throttledSelectConversation(conversation.conversationId)}
              >
                <div className="conversation-info">
                  <div className="conversation-title">{conversation.title}</div>
                  <div className="conversation-meta">
                    <span className="message-count">
                      <span 
                        ref={(el) => {
                          if (el && messageCountRefs) {
                            messageCountRefs.current.set(conversation.conversationId, el);
                          }
                        }}
                      >
                        {conversation.messageCount}
                      </span>
                      {' 条消息'}
                    </span>
                    <ConversationTime updatedAt={conversation.updatedAt} />
                  </div>
                </div>
                <button
                  className="delete-conversation-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`确定删除对话"${conversation.title}"吗?`)) {
                      throttledDeleteConversation(conversation.conversationId);
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

