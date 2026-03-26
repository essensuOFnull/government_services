import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useAuthContext } from './auth/AuthContext';
import { useFileCache } from '../hooks/useFileCache';
import { useMessengerWebSocket } from '../hooks/useMessengerWebSocket';
import { useStorageInfo } from '../hooks/useStorageInfo';
import { useOnlineUsers } from '../hooks/useOnlineUsers';
import { useTyping } from '../hooks/useTyping';
import { useUploadingUsers } from '../hooks/useUploadingUsers';
import { useUsers } from '../hooks/useUsers';
import { useMessages } from '../hooks/useMessages';
import { useConversations } from '../hooks/useConversations';
import MessengerSidebar from './MessengerSidebar';
import MessengerMain from './MessengerMain';
import './Messenger.css';

export function Messenger({ userId }) {
  const { user } = useAuthContext();

  // 1. Базовые хуки (не зависят от WebSocket)
  const { cacheEnabled, getCachedFile, saveToCache } = useFileCache();
  const { storageInfo, updateStorageInfo } = useStorageInfo(userId);
  const { onlineUsers, handleUserStatusChanged } = useOnlineUsers();
  const { users, setUser } = useUsers();
  const { uploadingUsers, handleUploadStart, handleUploadComplete } = useUploadingUsers();
  const {
    conversations,
    currentConversation,
    setCurrentConversation,
    unreadCounts,
    createConversation,
    openFavorites,
    clearChat,
    handleConversationDeleted,
    handleChatCleared,
    incrementUnreadCount,
    resetUnreadCount,
  } = useConversations(userId);

  // 2. Звуковое уведомление
  const playNotificationSound = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gainNode.gain.value = 0.3;
      oscillator.start();
      gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.5);
      oscillator.stop(audioContext.currentTime + 0.5);
      audioContext.resume();
    } catch (err) {
      console.error('Ошибка воспроизведения звука:', err);
    }
  }, []);

  // 3. Рефы для функций, которые будут использоваться в WebSocket обработчике
  // (чтобы обработчик был стабильным и не пересоздавался)
  const setUserRef = useRef(setUser);
  const incrementUnreadCountRef = useRef(incrementUnreadCount);
  const playNotificationSoundRef = useRef(playNotificationSound);
  const handleUploadStartRef = useRef(handleUploadStart);
  const handleUploadCompleteRef = useRef(handleUploadComplete);
  const handleUserStatusChangedRef = useRef(handleUserStatusChanged);
  const updateStorageInfoRef = useRef(updateStorageInfo);
  const handleConversationDeletedRef = useRef(handleConversationDeleted);
  const handleChatClearedRef = useRef(handleChatCleared);
  const currentConversationRef = useRef(currentConversation);
  const userIdRef = useRef(userId);

  // Рефы для функций из useMessages (будут заполнены после создания useMessages)
  const handleNewMessageRef = useRef(null);
  const handleMessageDeletedRef = useRef(null);
  const handleMessageReadRef = useRef(null);
  const handleUserLeftChatRef = useRef(null);
  const setMessagesRef = useRef(null);

  // Рефы для typing
  const handleTypingStartRef = useRef(null);
  const handleTypingStopRef = useRef(null);

  // Обновляем рефы при изменении зависимостей
  useEffect(() => {
    setUserRef.current = setUser;
    incrementUnreadCountRef.current = incrementUnreadCount;
    playNotificationSoundRef.current = playNotificationSound;
    handleUploadStartRef.current = handleUploadStart;
    handleUploadCompleteRef.current = handleUploadComplete;
    handleUserStatusChangedRef.current = handleUserStatusChanged;
    updateStorageInfoRef.current = updateStorageInfo;
    handleConversationDeletedRef.current = handleConversationDeleted;
    handleChatClearedRef.current = handleChatCleared;
    currentConversationRef.current = currentConversation;
    userIdRef.current = userId;
  }, [
    setUser, incrementUnreadCount, playNotificationSound,
    handleUploadStart, handleUploadComplete, handleUserStatusChanged,
    updateStorageInfo, handleConversationDeleted, handleChatCleared,
    currentConversation, userId
  ]);

  // 4. Стабильный обработчик WebSocket (использует рефы, не меняется)
  const handleWebSocketMessage = useCallback((message) => {
    const { type, ...data } = message;
    const currentConv = currentConversationRef.current;
    const currentUserId = userIdRef.current;

    switch (type) {
      case 'new_message': {
        const msg = data.message;
        if (handleNewMessageRef.current) handleNewMessageRef.current(msg);
        if (msg && msg.sender_id && msg.sender_username) {
          setUserRef.current(msg.sender_id, { id: msg.sender_id, username: msg.sender_username });
        }
        if (msg && msg.sender_id !== currentUserId) {
          incrementUnreadCountRef.current(msg.conversation_id);
          playNotificationSoundRef.current();
        }
        break;
      }
      case 'forward_message': {
        if (currentConv?.id === data.message?.conversation_id && setMessagesRef.current) {
          setMessagesRef.current(prev => [...prev, data.message]);
        }
        if (data.message && data.message.sender_id && data.message.sender_username) {
          setUserRef.current(data.message.sender_id, { id: data.message.sender_id, username: data.message.sender_username });
        }
        if (data.message && data.message.sender_id !== currentUserId) {
          incrementUnreadCountRef.current(data.message.conversation_id);
          playNotificationSoundRef.current();
        }
        break;
      }
      case 'message_deleted':
        if (handleMessageDeletedRef.current) handleMessageDeletedRef.current(data.messageId, data.conversationId);
        break;
      case 'message_read':
        if (handleMessageReadRef.current) handleMessageReadRef.current(data.messageId, data.userId);
        break;
      case 'user_typing':
        if (handleTypingStartRef.current) handleTypingStartRef.current(data.userId);
        if (data.username && data.userId) {
          setUserRef.current(data.userId, { id: data.userId, username: data.username });
        }
        break;
      case 'user_stopped_typing':
        if (handleTypingStopRef.current) handleTypingStopRef.current(data.userId);
        break;
      case 'user_uploading_file':
        if (handleUploadStartRef.current) handleUploadStartRef.current(data.userId, data.filename);
        break;
      case 'user_upload_complete':
        if (handleUploadCompleteRef.current) handleUploadCompleteRef.current(data.userId);
        break;
      case 'user_status_changed':
        if (handleUserStatusChangedRef.current) handleUserStatusChangedRef.current(data.userId, data.status);
        break;
      case 'user_status':
        setUserRef.current(data.user.id, data.user);
        break;
      case 'storage_info_updated':
        if (updateStorageInfoRef.current) updateStorageInfoRef.current(data.storageInfo);
        break;
      case 'user_left_chat':
        if (handleUserLeftChatRef.current) handleUserLeftChatRef.current(data.conversationId, data.userId);
        break;
      case 'conversation_deleted':
        if (handleConversationDeletedRef.current) handleConversationDeletedRef.current(data.conversationId);
        break;
      case 'chat_cleared_for_me':
        if (handleChatClearedRef.current) handleChatClearedRef.current(data.conversationId);
        break;
      default:
        console.error('Неизвестный тип сообщения:', type);
    }
  }, []); // пустой массив зависимостей – стабильный колбэк

  // 5. WebSocket (зависит только от userId, не пересоздаётся при изменении обработчика)
  const { send: wsSend } = useMessengerWebSocket(userId, handleWebSocketMessage);

  // 6. Typing (зависит от wsSend и currentConversation)
  const { typingUsers, handleTyping, handleTypingStart, handleTypingStop } = useTyping(
    currentConversation?.id,
    wsSend
  );

  // Обновляем рефы typing при их изменении
  useEffect(() => {
    handleTypingStartRef.current = handleTypingStart;
    handleTypingStopRef.current = handleTypingStop;
  }, [handleTypingStart, handleTypingStop]);

  // 7. Messages (зависит от wsSend, который стабилен)
  const {
    allMessages,
    fileMeta,
    messageInput,
    setMessageInput,
    attachments,
    setAttachments,
    hasMore,
    handleSendMessage,
    handleRetry,
    handleNewMessage,
    handleMessageDeleted,
    handleMessageRead,
    handleUserLeftChat,
    removeAttachment,
    handleFileUpload,
    handleDrop,
    loadMoreMessages,
    setMessages,
  } = useMessages({
    currentConversation,
    userId,
    wsSend,
    cacheEnabled,
    getCachedFile,
    saveToCache,
  });

  // Обновляем рефы для функций из useMessages
  useEffect(() => {
    handleNewMessageRef.current = handleNewMessage;
    handleMessageDeletedRef.current = handleMessageDeleted;
    handleMessageReadRef.current = handleMessageRead;
    handleUserLeftChatRef.current = handleUserLeftChat;
    setMessagesRef.current = setMessages;
  }, [handleNewMessage, handleMessageDeleted, handleMessageRead, handleUserLeftChat, setMessages]);

  // 8. UI состояния и CSS переменные
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const toggleSidebar = useCallback(() => setIsSidebarCollapsed(prev => !prev), []);

  const containerRef = useRef(null);
  const sidebarRef = useRef(null);
  const menuToggleRef = useRef(null);
  const resizeObserverRef = useRef(null);

  const updateVariables = useCallback(() => {
    const container = containerRef.current;
    const sidebar = sidebarRef.current;
    const toggle = menuToggleRef.current;
    if (!container || !sidebar || !toggle) return;
    const sidebarWidth = isSidebarCollapsed ? 0 : sidebar.offsetWidth;
    container.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
    const toggleRect = toggle.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const bottomOffset = containerRect.bottom - toggleRect.bottom;
    container.style.setProperty('--menu-toggle-bottom', `${bottomOffset}px`);
    container.style.setProperty('--menu-toggle-height', `${toggleRect.height}px`);
  }, [isSidebarCollapsed]);

  const handleSidebarRef = useCallback((node) => {
    if (sidebarRef.current === node) return;
    if (sidebarRef.current && resizeObserverRef.current) {
      resizeObserverRef.current.unobserve(sidebarRef.current);
    }
    sidebarRef.current = node;
    if (node) {
      if (!resizeObserverRef.current) {
        resizeObserverRef.current = new ResizeObserver(() => updateVariables());
      }
      resizeObserverRef.current.observe(node);
      updateVariables();
    }
  }, [updateVariables]);

  const handleMenuToggleRef = useCallback((node) => {
    if (menuToggleRef.current === node) return;
    if (menuToggleRef.current && resizeObserverRef.current) {
      resizeObserverRef.current.unobserve(menuToggleRef.current);
    }
    menuToggleRef.current = node;
    if (node) {
      if (!resizeObserverRef.current) {
        resizeObserverRef.current = new ResizeObserver(() => updateVariables());
      }
      resizeObserverRef.current.observe(node);
      updateVariables();
    }
  }, [updateVariables]);

  useEffect(() => {
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    updateVariables();
  }, [updateVariables]);

  const handleUserSelected = useCallback(async (selectedUser) => {
    setShowUserSearch(false);
    if (!selectedUser?.id) return;
    const newConv = await createConversation([selectedUser.id]);
    if (newConv) {
      setCurrentConversation(newConv);
      resetUnreadCount(newConv.id);
    }
  }, [createConversation, setCurrentConversation, resetUnreadCount]);

  if (!storageInfo) return null;

  const { serverStatus } = storageInfo;
  if (serverStatus?.isLowSpace) {
    return (
      <div className="storage-warning">
        <p>⚠️ {storageInfo.message}</p>
      </div>
    );
  }

  return (
    <div className={`messenger-container ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`} ref={containerRef}>
      <MessengerSidebar
        ref={handleSidebarRef}
        conversations={conversations}
        currentConversation={currentConversation}
        onSelectConversation={(conv) => {
          setCurrentConversation(conv);
          resetUnreadCount(conv.id);
        }}
        unreadCounts={unreadCounts}
        openFavorites={async () => {
          const fav = await openFavorites();
          if (fav) setCurrentConversation(fav);
        }}
        onSearchUser={() => setShowUserSearch(s => !s)}
        showUserSearch={showUserSearch}
        onUserSelected={handleUserSelected}
        userId={userId}
        cacheEnabled={cacheEnabled}
        getCachedFile={getCachedFile}
        saveToCache={saveToCache}
        users={users}
      />
      <MessengerMain
        currentConversation={currentConversation}
        allMessages={allMessages}
        fileMeta={fileMeta}
        users={users}
        onDeleteMessage={(messageId, storageInfoUpdate) => {
          setMessages(prev => prev.filter(m => m.id !== messageId));
          if (storageInfoUpdate) updateStorageInfo(storageInfoUpdate);
        }}
        userId={userId}
        cacheEnabled={cacheEnabled}
        getCachedFile={getCachedFile}
        saveToCache={saveToCache}
        onRetry={handleRetry}
        storageInfo={storageInfo}
        typingUsers={typingUsers}
        uploadingUsers={uploadingUsers}
        onClearChat={() => clearChat(currentConversation?.id)}
        messageInput={messageInput}
        onMessageInputChange={setMessageInput}
        onSendMessage={handleSendMessage}
        attachments={attachments}
        onRemoveAttachment={removeAttachment}
        onFileUpload={handleFileUpload}
        onDrop={handleDrop}
        onTyping={handleTyping}
        toggleSidebar={toggleSidebar}
        isSidebarCollapsed={isSidebarCollapsed}
        hasMore={hasMore}
        loadMoreMessages={loadMoreMessages}
      />
    </div>
  );
}

export default Messenger;