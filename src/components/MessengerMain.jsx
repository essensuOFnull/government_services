import MessengerHeader from './MessengerHeader';
import MessageList from './MessageList';
import MessageInput from './MessageInput';

export function MessengerMain({
  currentConversation,
  allMessages,
  fileMeta,
  users,
  onDeleteMessage,
  userId,
  cacheEnabled,
  getCachedFile,
  saveToCache,
  onRetry,
  storageInfo,
  typingUsers,
  uploadingUsers,
  onClearChat,
  messageInput,
  onMessageInputChange,
  onSendMessage,
  attachments,
  onRemoveAttachment,
  onFileUpload,
  onDrop,
  onTyping,
  toggleSidebar,
  isSidebarCollapsed,
  hasMore,
  loadMoreMessages,
}) {
  if (!currentConversation) {
    return (
      <div className="no-conversation">
        <p>Выберите разговор</p>
      </div>
    );
  }

  return (
    <div className="messenger-main">
      <MessengerHeader
        currentConversation={currentConversation}
        storageInfo={storageInfo}
        typingUsers={typingUsers}
        uploadingUsers={uploadingUsers}
        users={users}
        onClearChat={onClearChat}
      />
      <MessageList
        allMessages={allMessages}
        fileMeta={fileMeta}
        users={users}
        onDeleteMessage={onDeleteMessage}
        userId={userId}
        cacheEnabled={cacheEnabled}
        getCachedFile={getCachedFile}
        saveToCache={saveToCache}
        onRetry={onRetry}
        hasMore={hasMore}
        loadMoreMessages={loadMoreMessages}
      />
      <MessageInput
        value={messageInput}
        onChange={onMessageInputChange}
        onSend={onSendMessage}
        attachments={attachments}
        onRemoveAttachment={onRemoveAttachment}
        onFileUpload={onFileUpload}
        onDrop={onDrop}
        onTyping={onTyping}
        toggleSidebar={toggleSidebar}
        isSidebarCollapsed={isSidebarCollapsed}
      />
    </div>
  );
}
export default MessengerMain;