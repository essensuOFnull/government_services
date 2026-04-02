import React from 'react';

export function MessengerHeader({
  currentConversation,
  storageInfo,
  typingUsers,
  uploadingUsers,
  users,
  onClearChat,
}) {
  return (
    <div className="window messenger-header">
      <div className='row' style={{justifyContent:'space-between'}}>
        <p><strong>{currentConversation.title}</strong></p>
        <button onClick={onClearChat} className="clear-chat-button" title="Удалить все свои сообщения в этом чате">
          🗑️
        </button>
      </div>
      <div className='row' style={{justifyContent:'space-between'}}>
        <p>{storageInfo?.message}</p>
        <p className="storage-percentage">Занято {storageInfo?.quota?.percentageUsed || 0}%</p>
      </div>
      <div className="progress-indicator segmented">
        <span className="progress-indicator-bar" style={{ width: `${Math.min(storageInfo?.quota?.percentageUsed || 0, 100)}%` }} />
      </div>

      <div className="typing-indicator-header">
        <span>Печатают: </span>
        <span className='users-list-span'>
          {typingUsers.size > 0 && (
            Array.from(typingUsers).map(id => {
              const u = users.get(id);
              return (u && (u.username || u.displayName || u.name)) || id;
            }).join(', ')
          )}
        </span>
      </div>
      <div className="uploading-indicator-header">
        <span>Загружают файлы: </span>
        <span className='users-list-span'>
          {uploadingUsers.size > 0 && (
            Array.from(uploadingUsers.values()).join(', ')
          )}
        </span>
      </div>
    </div>
  );
}
export default MessengerHeader;