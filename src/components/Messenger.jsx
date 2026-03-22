import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Messenger.css';

import Message from './Message';
import Avatar from './Avatar';
import UserSearch from './UserSearch';

export function Messenger({ userId }) {
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [storageInfo, setStorageInfo] = useState(null);
  const [users, setUsers] = useState(new Map());
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [uploadingUsers, setUploadingUsers] = useState(new Map());
  const wsRef = useRef(null);
  const messageListRef = useRef(null);
  const [pageSize] = useState(30);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [fileMeta, setFileMeta] = useState(new Map());
  const [showUserSearch, setShowUserSearch] = useState(false);
  const typingTimeoutRef = useRef(null);

  const currentConversationRef = useRef(currentConversation);

  useEffect(() => {
    currentConversationRef.current = currentConversation;
  }, [currentConversation]);

  // Новые состояния для счётчика непрочитанных
  const [unreadCounts, setUnreadCounts] = useState({});

  // Флаг для отслеживания, был ли скролл внизу
  const wasAtBottomRef = useRef(true);
  // Флаг для первоначальной прокрутки в конец при смене чата
  const initialScrollDoneRef = useRef(false);

  // Воспроизведение короткого звукового сигнала через Web Audio API
  const playNotificationSound = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.type = 'sine';
      oscillator.frequency.value = 880; // частота 880 Гц
      gainNode.gain.value = 0.3;        // громкость
      oscillator.start();
      // затухание за 0.5 секунды
      gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.5);
      oscillator.stop(audioContext.currentTime + 0.5);
      // возобновляем контекст, если он был приостановлен (политика автозапуска)
      audioContext.resume();
    } catch (err) {
      console.error('Ошибка воспроизведения звука:', err);
    }
  }, []);

  // Создать чат с найденным пользователем
  const handleUserSelected = async (user) => {
    setShowUserSearch(false);
    if (!user || !user.id) return;
    try {
      const res = await fetch('/api/messenger/conversation/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ participantIds: [user.id] })
      });
      const j = await res.json();
      if (j.success && j.conversation) {
        const exists = conversations.some(c => c.id === j.conversation.id);
        if (!exists) setConversations([...conversations, j.conversation]);
        setCurrentConversation(j.conversation);
        setOffset(0);
        setHasMore(true);
        setMessages([]);
      }
    } catch (e) { console.error(e); }
  };

  // Инициализация WebSocket
  useEffect(() => {
    if (!userId) return;

    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host || `${window.location.hostname}:${window.location.port || 22869}`;
    const wsUrl = `${scheme}://${host}/ws/messenger?userId=${encodeURIComponent(userId)}`;
    try {
      wsRef.current = new WebSocket(wsUrl);
    } catch (err) {
      console.error('WebSocket init error:', err);
      wsRef.current = null;
      return;
    }

    wsRef.current.addEventListener('open', () => {
      console.log('✅ WebSocket подключен');
    });

    wsRef.current.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message);
    });

    wsRef.current.addEventListener('close', () => {
      console.log('❌ WebSocket отключен');
    });

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [userId]);

  const handleWebSocketMessage = useCallback((message) => {
    const { type, ...data } = message;

    switch (type) {
      case 'forward_message':
        console.log('forward_message received:', data.message);
        // Добавляем сообщение только если это текущий чат
        if (currentConversationRef.current && currentConversationRef.current.id === data.message?.conversation_id) {
          setMessages(prev => [...prev, data.message]);
          if (data.message.file_ids && data.message.file_ids.length > 0) {
            const fileIdsToFetch = new Set();
            data.message.file_ids.forEach(fid => { 
              if (!fileMeta.has(fid)) fileIdsToFetch.add(fid); 
            });
            if (fileIdsToFetch.size > 0) {
              (async () => {
                const newMap = new Map(fileMeta);
                for (const fid of fileIdsToFetch) {
                  try {
                    const resp = await fetch(`/api/messenger/file/${fid}`, { headers: { 'x-user-id': userId } });
                    const j = await resp.json();
                    if (j.success && j.file) {
                      newMap.set(fid, j.file);
                    }
                  } catch (e) { console.error('file meta fetch', e); }
                }
                setFileMeta(newMap);
              })();
            }
          }
        }
        // Сохраняем отправителя в users Map, чтобы аватарка отображалась
        if (data.message && data.message.sender_id && data.message.sender_username) {
          setUsers(prev => new Map(prev).set(data.message.sender_id, {
            id: data.message.sender_id,
            username: data.message.sender_username
          }));
        }
        // Уведомление о пересланном сообщении, если не от текущего пользователя и чат не активен
        if (data.message && data.message.sender_id !== userId) {
          const conversationId = data.message.conversation_id;
          if (!currentConversation || currentConversation.id !== conversationId) {
            setUnreadCounts(prev => ({
              ...prev,
              [conversationId]: (prev[conversationId] || 0) + 1
            }));
            playNotificationSound();
          }
        }
        break;

      case 'new_message':
        console.log('new_message received:', data.message);
        // Добавляем сообщение только если это текущий чат
        if (currentConversationRef.current && currentConversationRef.current.id === data.message?.conversation_id) {
          setMessages(prev => [...prev, data.message]);
        }
        // Сохраняем отправителя в users Map
        if (data.message && data.message.sender_id && data.message.sender_username) {
          setUsers(prev => new Map(prev).set(data.message.sender_id, {
            id: data.message.sender_id,
            username: data.message.sender_username
          }));
        }
        // Уведомление о новом сообщении
        if (data.message && data.message.sender_id !== userId) {
          const conversationId = data.message.conversation_id;
          if (!currentConversation || currentConversation.id !== conversationId) {
            setUnreadCounts(prev => ({
              ...prev,
              [conversationId]: (prev[conversationId] || 0) + 1
            }));
            playNotificationSound();
          }
        }
        break;

      // остальные case без изменений
      case 'user_typing':
        setTypingUsers(prev => new Set([...prev, data.userId]));
        if (data.username && data.userId) {
          setUsers(prev => {
            const updated = new Map(prev);
            updated.set(data.userId, { id: data.userId, username: data.username });
            return updated;
          });
        }
        break;

      case 'user_stopped_typing':
        setTypingUsers(prev => {
          const next = new Set(prev);
          next.delete(data.userId);
          return next;
        });
        break;

      case 'user_uploading_file':
        setUploadingUsers(prev => new Map(prev).set(data.userId, data.filename));
        break;

      case 'user_upload_complete':
        setUploadingUsers(prev => {
          const next = new Map(prev);
          next.delete(data.userId);
          return next;
        });
        break;

      case 'user_status_changed':
        if (data.status === 'online') {
          setOnlineUsers(prev => new Set([...prev, data.userId]));
        } else {
          setOnlineUsers(prev => {
            const next = new Set(prev);
            next.delete(data.userId);
            return next;
          });
        }
        break;

      case 'user_status':
        setUsers(prev => new Map(prev).set(data.user.id, data.user));
        break;

      case 'message_read':
        setMessages(prev => prev.map(m => 
          m.id === data.messageId ? { ...m, readBy: [...(m.readBy || []), data.userId] } : m
        ));
        break;
      case 'message_deleted':
        console.log('message_deleted received:', data);
        // Удаляем сообщение из текущего чата, если оно относится к нему
        if (currentConversationRef.current && data.conversationId === currentConversationRef.current.id) {
          setMessages(prev => prev.filter(m => m.id !== data.messageId));
        }
        break;
      case 'storage_updated':
        console.log('storage_updated received:', data.storageInfo);
        setStorageInfo(data.storageInfo);
        break;
      default:
        console.log('Неизвестный тип сообщения:', type);
    }
  }, [currentConversation, fileMeta, userId, playNotificationSound]);

  // Получение хранилища
  useEffect(() => {
    const fetchStorageInfo = async () => {
      try {
        const response = await fetch('/api/messenger/storage-info', {
          headers: { 'x-user-id': userId }
        });
        const data = await response.json();
        setStorageInfo(data);
      } catch (error) {
        console.error('Ошибка получения информации о хранилище:', error);
      }
    };

    fetchStorageInfo();
    const interval = setInterval(fetchStorageInfo, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [userId]);

  // Получение разговоров
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const response = await fetch('/api/messenger/conversations', {
          headers: { 'x-user-id': userId }
        });
        const data = await response.json();
        setConversations(data.conversations || []);
      } catch (error) {
        console.error('Ошибка получения разговоров:', error);
      }
    };

    fetchConversations();
  }, [userId]);

  // Создать/получить "Избранное"
  const openFavorites = async () => {
    if (!userId) return;
    try {
      const res = await fetch('/api/messenger/conversation/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ participantIds: [userId] })
      });
      const j = await res.json();
      if (j.success && j.conversation) {
        const exists = conversations.some(c => c.id === j.conversation.id);
        if (!exists) {
          const newConversation = {
            ...j.conversation,
            title: 'Избранное',
            otherParticipants: []
          };
          setConversations([...conversations, newConversation]);
        }
        setCurrentConversation(j.conversation);
        setOffset(0);
        setHasMore(true);
        setMessages([]);
      }
    } catch (e) { console.error(e); }
  };

  // Получение сообщений при смене разговора
  useEffect(() => {
    if (!currentConversation) return;

    const fetchMessages = async (lim = pageSize, off = 0, prepend = false) => {
      try {
        const response = await fetch(
          `/api/messenger/conversation/${currentConversation.id}/messages?limit=${lim}&offset=${off}`,
          { headers: { 'x-user-id': userId } }
        );
        const data = await response.json();
        const msgs = data.messages || [];
        if (prepend) {
          setMessages(prev => [...msgs, ...prev]);
        } else {
          setMessages(msgs);
          // Сбросим флаги для новой загрузки
          initialScrollDoneRef.current = false;
          wasAtBottomRef.current = true;
        }
        if (msgs.length < lim) setHasMore(false);
        else setHasMore(true);
        setOffset(prev => prev + msgs.length);
      } catch (error) {
        console.error('Ошибка получения сообщений:', error);
      }
    };

    setOffset(0);
    fetchMessages(pageSize, 0, false);
  }, [currentConversation, userId]);

  // Сброс счётчика непрочитанных при открытии чата
  useEffect(() => {
    if (currentConversation) {
      setUnreadCounts(prev => {
        const newCounts = { ...prev };
        delete newCounts[currentConversation.id];
        return newCounts;
      });
    }
  }, [currentConversation]);

  // Прокрутка в конец при загрузке сообщений (если это инициализация)
  useEffect(() => {
    if (!messageListRef.current || messages.length === 0) return;
    if (!initialScrollDoneRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
      initialScrollDoneRef.current = true;
      wasAtBottomRef.current = true;
    }
  }, [messages]);

  // Автоматическая прокрутка вниз при добавлении новых сообщений, если пользователь был внизу
  useEffect(() => {
    if (!messageListRef.current || messages.length === 0) return;
    if (wasAtBottomRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  // Отслеживание положения скролла для wasAtBottomRef
  useEffect(() => {
    const container = messageListRef.current;
    if (!container) return;

    const handleScroll = () => {
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 20;
      wasAtBottomRef.current = atBottom;
    };

    container.addEventListener('scroll', handleScroll);
    // Начальная установка
    handleScroll();

    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Ленивая подгрузка старых сообщений при скролле вверх
  useEffect(() => {
    const container = messageListRef.current;
    if (!container) return;

    const handleScroll = async () => {
      if (container.scrollTop === 0 && hasMore && currentConversation) {
        // Загружаем следующую порцию старых сообщений
        try {
          const resp = await fetch(
            `/api/messenger/conversation/${currentConversation.id}/messages?limit=${pageSize}&offset=${offset}`,
            { headers: { 'x-user-id': userId } }
          );
          const json = await resp.json();
          const msgs = json.messages || [];
          if (msgs.length > 0) {
            // Сохраняем старую высоту для сохранения позиции
            const oldScrollHeight = container.scrollHeight;
            setMessages(prev => [...msgs, ...prev]);
            setOffset(prev => prev + msgs.length);
            if (msgs.length < pageSize) setHasMore(false);

            // После обновления DOM восстанавливаем прокрутку
            requestAnimationFrame(() => {
              const newScrollHeight = container.scrollHeight;
              const delta = newScrollHeight - oldScrollHeight;
              container.scrollTop = delta;
            });
          } else {
            setHasMore(false);
          }
        } catch (e) { console.error(e); }
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [currentConversation, hasMore, offset, pageSize, userId]);

  // Загрузка метаданных файлов
  useEffect(() => {
    const fileIdsToFetch = new Set();
    messages.forEach(m => {
      (m.file_ids || []).forEach(fid => { if (!fileMeta.has(fid)) fileIdsToFetch.add(fid); });
    });
    if (fileIdsToFetch.size === 0) return;

    (async () => {
      const newMap = new Map(fileMeta);
      for (const fid of fileIdsToFetch) {
        try {
          const resp = await fetch(`/api/messenger/file/${fid}`, { headers: { 'x-user-id': userId } });
          const j = await resp.json();
          if (j.success && j.file) {
            newMap.set(fid, j.file);
          }
        } catch (e) { console.error('file meta fetch', e); }
      }
      setFileMeta(newMap);
    })();
  }, [messages]);

  // Загрузка информации о пользователях из сообщений
  useEffect(() => {
    const userIds = new Set();
    messages.forEach(m => {
      if (m.sender_id) userIds.add(m.sender_id);
    });
    if (userIds.size === 0) return;

    userIds.forEach(senderId => {
      if (!users.has(senderId)) {
        const msg = messages.find(m => m.sender_id === senderId);
        if (msg && msg.sender_username) {
          setUsers(prev => {
            const updated = new Map(prev);
            updated.set(senderId, { 
              id: senderId, 
              username: msg.sender_username,
              userId: msg.sender_userId || senderId
            });
            return updated;
          });
        }
      }
    });
  }, [messages, users]);

  const handleSendMessage = async () => {
    if (!messageInput.trim() && attachments.length === 0) return;
    if (!currentConversation.id) return;

    const content = messageInput;
    setMessageInput('');

    let uploadedFileIds = [];
    if (attachments.length > 0) {
      try {
        const formData = new FormData();
        attachments.forEach(f => formData.append('files', f));
        formData.append('conversationId', currentConversation.id);

        const resp = await fetch('/api/messenger/upload-files', {
          method: 'POST',
          headers: { 'x-user-id': userId },
          body: formData
        });
        const j = await resp.json();
        if (j.success && Array.isArray(j.files)) {
          uploadedFileIds = j.files.map(f => f.id);
          if (j.storageInfo) setStorageInfo(j.storageInfo);
        } else {
          console.error('Ошибка загрузки вложений', j && j.message);
        }
      } catch (e) {
        console.error('Ошибка при загрузке вложений', e);
      }
    }

    wsRef.current?.send(JSON.stringify({
      type: 'send_message',
      data: {
        conversationId: currentConversation.id,
        content,
        fileIds: uploadedFileIds
      }
    }));

    setAttachments([]);
  };

  const handleTyping = () => {
    if (!currentConversation.id) return;

    wsRef.current?.send(JSON.stringify({
      type: 'typing_start',
      data: { conversationId: currentConversation.id }
    }));

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      wsRef.current?.send(JSON.stringify({
        type: 'typing_stop',
        data: { conversationId: currentConversation.id }
      }));
    }, 3000);
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !currentConversation.id) return;
    setAttachments(prev => [...prev, ...files]);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length && currentConversation.id) {
      setAttachments(prev => [...prev, ...files]);
    }
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const removeMessageFromList = (messageId, storageInfoUpdate) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
    if (storageInfoUpdate) setStorageInfo(storageInfoUpdate);
  };

  const getStatusText = (userId) => {
    if (onlineUsers.has(userId)) return 'онлайн';
    const user = users.get(userId);
    if (user?.timeAgoText) return user.timeAgoText;
    return 'офлайн';
  };

  if (!storageInfo) return null;

  const { quota, serverStatus } = storageInfo;
  if (serverStatus?.isLowSpace) {
    return (
      <div className="storage-warning">
        <p>⚠️ {storageInfo.message}</p>
      </div>
    );
  }

  const percentage = quota.percentageUsed || 0;

  return (
    <div className="messenger-container">
      <div className="window messenger-sidebar">
        <p><strong>Разговоры</strong></p>
        <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
          <button onClick={openFavorites}>Избранное</button>
          <button onClick={() => setShowUserSearch(s => !s)}>
            Найти пользователя
          </button>
        </div>
        {showUserSearch && (
          <UserSearch onUserSelected={handleUserSelected} />
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
                onClick={() => setCurrentConversation(conv)}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-start' }}
              >
                {otherParticipant && (
                  <Avatar userId={otherParticipant} username={displayName} size={32} />
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

      <div className="messenger-main">
        {currentConversation ? (
          <>
            <div className="window messenger-header">
              <p><strong>{currentConversation.title}</strong></p>
              <p>{storageInfo.message}</p>
              <div className="progress-indicator segmented">
                <span className="progress-indicator-bar" style={{ width: `${Math.min(percentage, 100)}%` }} />
              </div>
              <p className="storage-percentage">Занято {percentage}%</p>

              {/* Индикаторы печати и загрузки */}
              {typingUsers.size > 0 && (
                <div className="typing-indicator-header">
                  {Array.from(typingUsers).map(id => {
                    const u = users.get(id);
                    return (u && (u.username || u.displayName || u.name)) || id;
                  }).join(', ')} печатает...
                </div>
              )}
              {uploadingUsers.size > 0 && (
                <div className="uploading-indicator-header">
                  Загружаются файлы: {Array.from(uploadingUsers.values()).join(', ')}
                </div>
              )}
            </div>

            <div className="messages-list" ref={messageListRef}>
              {messages.map(msg => (
                <Message
                  key={msg.id}
                  msg={msg}
                  fileMeta={fileMeta}
                  users={users}
                  onDelete={removeMessageFromList}
                  wsRef={wsRef}
                />
              ))}
            </div>

            <div className="window message-input-area field-row-stacked" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
              {attachments.length > 0 && (
                <div className="attachments-list">
                  {attachments.map((f, idx) => (
                    <div key={idx} className="attachment-item">
                      <span>{f.name}</span>
                      <button onClick={() => removeAttachment(idx)}>Удалить</button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                value={messageInput}
                onChange={(e) => {
                  setMessageInput(e.target.value);
                  handleTyping();
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Введите сообщение..."
              />
              <div className="message-actions">
                <button>
                  <label>
                    📎
                    <input
                      type="file"
                      multiple
                      onChange={handleFileUpload}
                      hidden
                    />
                  </label>
                </button>
                <button onClick={handleSendMessage}>Отправить</button>
              </div>
            </div>
          </>
        ) : (
          <div className="no-conversation">
            <p>Выберите разговор</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Messenger;