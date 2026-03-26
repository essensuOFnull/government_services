import React, { useRef } from 'react';
import Message from './Message';
import { useScrollPagination } from '../hooks/useScrollPagination';

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
          key={msg._key}
          msg={msg}
          fileMeta={fileMeta}
          users={users}
          onDelete={onDeleteMessage}
          wsRef={null} // TODO: передать wsRef? Нужен ли он в Message?
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