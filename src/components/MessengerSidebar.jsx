import React from 'react';
import Avatar from './Avatar';
import UserSearch from './UserSearch';

export function MessengerSidebar({
  conversations,
  currentConversation,
  onSelectConversation,
  unreadCounts,
  openFavorites,
  onSearchUser,
  showUserSearch,
  onUserSelected,
  userId,
  cacheEnabled,
  getCachedFile,
  saveToCache,
  users,
}) {
  return (
    <div className="window messenger-sidebar">
      <p><strong>Разговоры</strong></p>
      <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
        <button onClick={openFavorites}>Избранное</button>
        <button onClick={onSearchUser}>
          Найти пользователя
        </button>
      </div>
      <hr style={{ width: '100%' }} />
      {showUserSearch && (
        <UserSearch onUserSelected={onUserSelected} />
      )}
      <div className="conversations-list">
        {conversations.map(conv => {
          const participantIds = conv.participant_ids ? JSON.parse(conv.participant_ids) : [];
          const otherParticipant = participantIds.find(id => id !== userId);
          const otherUser = otherParticipant ? users.get(otherParticipant) : null;
          const displayName = otherUser?.username || conv.title || conv.id;

          return (
            <button
              key={conv.id}
              className={`conversation-item ${currentConversation && currentConversation.id === conv.id ? 'active' : ''}`}
              onClick={() => onSelectConversation(conv)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-start' }}
            >
              {otherParticipant && (
                <Avatar
                  userId={otherParticipant}
                  username={displayName}
                  size={32}
                  cacheEnabled={cacheEnabled}
                  getCachedFile={getCachedFile}
                  saveToCache={saveToCache}
                />
              )}
              <span>{displayName}</span>
              {unreadCounts[conv.id] > 0 && (
                <span className="unread-badge">{unreadCounts[conv.id]}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
export default MessengerSidebar;