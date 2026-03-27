import React, { useRef,useCallback } from 'react';
import Message from './Message';
import { useScrollPagination } from '../hooks/useScrollPagination';
import { useMessengerWebSocket } from '../hooks/useMessengerWebSocket';
import { useAuthContext } from '../contexts/AuthContext';

export function MessageList({
  allMessages,
  fileMeta,
  users,
  onDeleteMessage,
  userId,
  cacheEnabled,
  getCachedFile,
  saveToCache,
  onRetry,
  hasMore,
  loadMoreMessages,
}) {
  const { user} = useAuthContext();
  const handleWebSocketMessage = useCallback((data) => {
    // Здесь можно обрабатывать другие типы сообщений
  }, []);
  const {wsRef } = useMessengerWebSocket(user?.id, handleWebSocketMessage);

  const messageListRef = useRef(null);
  useScrollPagination({
    messageListRef,
    hasMore,
    loadMore: loadMoreMessages,
    allMessages,
  });

  return (
    <div className="messages-list" ref={messageListRef}>
      {allMessages.map(msg => (
        <Message
          key={`${msg.isPending ? 'pending' : 'real'}-${msg.id}`}
          msg={msg}
          fileMeta={fileMeta}
          users={users}
          onDelete={onDeleteMessage}
          wsRef={wsRef}
          userId={userId}
          cacheEnabled={cacheEnabled}
          getCachedFile={getCachedFile}
          saveToCache={saveToCache}
          isPending={msg.isPending}
          progress={msg.progress}
          pendingFiles={msg.files}
          status={msg.status}
          onRetry={() => onRetry(msg.localId)}
        />
      ))}
    </div>
  );
}
export default MessageList;