import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Conversation } from '../../../utils/conversation/conversationAPI';
import { useDateFormat, useThrottle } from '../../../hooks';
import VirtualList, { VirtualListHandle } from './VirtualList';
import './ConversationList.css';

interface ConversationListProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  unreadConversationIds?: string[];
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (conversationId: string) => void;
  isLoading?: boolean;
  messageCountRefs?: React.MutableRefObject<Map<string, HTMLElement>>;
}

const ConversationTime: React.FC<{ updatedAt: string }> = ({ updatedAt }) => {
  const formattedDate = useDateFormat(updatedAt);
  return <span className="conversation-time">{formattedDate}</span>;
};

const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  currentConversationId,
  unreadConversationIds = [],
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  isLoading = false,
  messageCountRefs,
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);
  const virtualListRef = useRef<VirtualListHandle>(null);

  const throttledSelectConversation = useThrottle(onSelectConversation, 500);
  const throttledNewConversation = useThrottle(onNewConversation, 1000);
  const throttledDeleteConversation = useThrottle(onDeleteConversation, 1000);

  const renderConversationItem = (conversation: Conversation) => (
    <div
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
            {' '}{t('conversation.messages', { count: conversation.messageCount })}
          </span>
          <ConversationTime updatedAt={conversation.updatedAt} />
        </div>
      </div>
      {unreadConversationIds.includes(conversation.conversationId) && (
        <span className="conversation-unread-dot" title="有新消息" />
      )}
      <button
        className="delete-conversation-btn"
        onClick={(e) => {
          e.stopPropagation();
          if (window.confirm(t('conversation.deleteConfirm'))) {
            throttledDeleteConversation(conversation.conversationId);
          }
        }}
        title={t('conversation.delete')}
      >
        🗑️
      </button>
    </div>
  );

  const renderEmptyState = () => (
    <div className="empty-conversations">
      <p>{t('conversation.noConversations')}</p>
      <p className="hint">{t('chat.newConversation')}</p>
    </div>
  );

  return (
    <div className={`conversation-sidebar ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="sidebar-header">
        <button
          className="toggle-sidebar-btn"
          onClick={() => setIsExpanded(!isExpanded)}
          title={isExpanded ? t('conversation.collapse') : t('conversation.expand')}
        >
          {isExpanded ? '◀' : '▶'}
        </button>
        {isExpanded && (
          <>
            <h2>{t('chat.conversationList')}</h2>
            <button
              className="new-conversation-btn"
              onClick={throttledNewConversation}
              disabled={isLoading}
              title={t('chat.newConversation')}
            >
              ➕ {t('chat.newConversation')}
            </button>
          </>
        )}
      </div>

      {isExpanded && (
        <div className="conversations-list">
          <VirtualList
            ref={virtualListRef}
            items={conversations}
            renderItem={renderConversationItem}
            estimatedItemHeight={90}
            minItemHeight={80}
            overscanRowCount={2}
            noItemsRenderer={renderEmptyState}
            getItemKey={(conversation) => conversation.conversationId}
          />
        </div>
      )}
    </div>
  );
};

export default ConversationList;

