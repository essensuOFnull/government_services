import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Messenger.css';
import Message from './Message';

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
  const typingTimeoutRef = useRef(null);

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
      case 'new_message':
        setMessages(prev => [...prev, data.message]);
        break;

      case 'user_typing':
        setTypingUsers(prev => new Set([...prev, data.userId]));
        // Add user info to users map if username is provided
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

      default:
        console.log('Неизвестный тип сообщения:', type);
    }
  }, []);

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
    // Обновляем каждые 5 минут
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

  // sidebar: favorites button will call openFavorites

  // Создать/получить "Избранное" (чат с самим собой)
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
        // Оптимистично добавим разговор в список, если его там еще нет
        const exists = conversations.some(c => c.id === j.conversation.id);
        if (!exists) {
          const newConversation = {
            ...j.conversation,
            title: 'Избранное',
            otherParticipants: []
          };
          setConversations([...conversations, newConversation]);
        }
        
        // откроем разговор и сбросим пагинацию
        setCurrentConversation(j.conversation.id);
        setOffset(0);
        setHasMore(true);
        setMessages([]);
      }
    } catch (e) { console.error(e); }
  };

  // Получение сообщений при смене разговора
  useEffect(() => {
    if (!currentConversation) return;

    // Загрузка последней страницы сообщений
    const fetchMessages = async (lim = pageSize, off = 0, prepend = false) => {
      try {
        const response = await fetch(
          `/api/messenger/conversation/${currentConversation}/messages?limit=${lim}&offset=${off}`,
          { headers: { 'x-user-id': userId } }
        );
        const data = await response.json();
        const msgs = data.messages || [];
        if (prepend) {
          setMessages(prev => [...msgs, ...prev]);
        } else {
          setMessages(msgs);
          // прокрутить вниз
          setTimeout(() => {
            if (messageListRef.current) {
              messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
            }
          }, 0);
        }

        // Обновим offset/hasMore
        if (msgs.length < lim) setHasMore(false);
        else setHasMore(true);
        setOffset(prev => prev + msgs.length);
      } catch (error) {
        console.error('Ошибка получения сообщений:', error);
      }
    };

    // reset offset and fetch latest page
    setOffset(0);
    fetchMessages(pageSize, 0, false);
  }, [currentConversation, userId]);

  // Ленивая подгрузка при скролле вверх
  useEffect(() => {
    const el = messageListRef.current;
    if (!el) return;

    const handler = async () => {
      if (el.scrollTop === 0 && hasMore && currentConversation) {
        // загружаем следующую страницу старых сообщений
        try {
          const lim = pageSize;
          const off = offset;
          const resp = await fetch(`/api/messenger/conversation/${currentConversation}/messages?limit=${lim}&offset=${off}`, { headers: { 'x-user-id': userId } });
          const json = await resp.json();
          const msgs = json.messages || [];
          if (msgs.length > 0) {
            setMessages(prev => [...msgs, ...prev]);
            setOffset(prev => prev + msgs.length);
            if (msgs.length < lim) setHasMore(false);
            // сохранить позицию прокрутки примерно на тот же элемент
            setTimeout(() => { if (el) el.scrollTop = msgs.length * 60; }, 10);
          } else {
            setHasMore(false);
          }
        } catch (e) { console.error(e); }
      }
    };

    el.addEventListener('scroll', handler);
    return () => el.removeEventListener('scroll', handler);
  }, [messageListRef, offset, hasMore, currentConversation, userId]);

  // Загрузка метаданных файлов для отображения
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

  const handleSendMessage = async () => {
    if (!messageInput.trim() && attachments.length === 0) return;
    if (!currentConversation) return;

    const content = messageInput;
    setMessageInput('');

    // Если есть вложения — сперва загружаем их в API одним запросом
    let uploadedFileIds = [];
    if (attachments.length > 0) {
      try {
        const formData = new FormData();
        attachments.forEach(f => formData.append('files', f));
        formData.append('conversationId', currentConversation);

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

    // Отправляем сообщение по WebSocket (включая ссылки на файлы если есть)
    wsRef.current?.send(JSON.stringify({
      type: 'send_message',
      data: {
        conversationId: currentConversation,
        content,
        fileIds: uploadedFileIds
      }
    }));

    // Очистим список вложений после отправки
    setAttachments([]);
  };

  const handleTyping = () => {
    if (!currentConversation) return;

    wsRef.current?.send(JSON.stringify({
      type: 'typing_start',
      data: { conversationId: currentConversation }
    }));

    // Очищаем предыдущий таймер
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Устанавливаем новый таймер для остановки печати
    typingTimeoutRef.current = setTimeout(() => {
      wsRef.current?.send(JSON.stringify({
        type: 'typing_stop',
        data: { conversationId: currentConversation }
      }));
    }, 3000);
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !currentConversation) return;

    // Добавляем выбранные файлы в список вложений (не отправляем сразу)
    setAttachments(prev => [...prev, ...files]);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length && currentConversation) {
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

  const getStorageDisplay = () => {
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
      <div className="storage-info">
        <p>{storageInfo.message}</p>
        <div className="storage-bar">
          <div 
            className="storage-used"
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
        <span className="storage-percentage">{percentage}%</span>
      </div>
    );
  };

  const getStatusText = (userId) => {
    if (onlineUsers.has(userId)) {
      return 'онлайн';
    }
    const user = users.get(userId);
    if (user?.timeAgoText) {
      return user.timeAgoText;
    }
    return 'офлайн';
  };

  return (
    <div className="messenger-container">
      <div className="messenger-sidebar">
        <h2>Разговоры</h2>
        <div style={{ marginBottom: 8 }}>
          <button onClick={openFavorites}>Избранное</button>
        </div>
        <div className="conversations-list">
          {conversations.map(conv => (
            <div
              key={conv.id}
              className={`conversation-item ${currentConversation === conv.id ? 'active' : ''}`}
              onClick={() => setCurrentConversation(conv.id)}
            >
              <span>{conv.title || conv.id}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="messenger-main">
        {currentConversation ? (
          <>
            <div className="messenger-header">
              <h3>Разговор</h3>
              {getStorageDisplay()}
            </div>

            <div className="messages-list" ref={messageListRef}>
              {messages.map(msg => (
                <Message key={msg.id} msg={msg} fileMeta={fileMeta} users={users} onDelete={removeMessageFromList} />
              ))}
              {typingUsers.size > 0 && (
                <div className="typing-indicator">
                  {Array.from(typingUsers).map(id => {
                    const u = users.get(id);
                    return (u && (u.username || u.displayName || u.name)) || id;
                  }).join(', ')} печатает...
                </div>
              )}
              {uploadingUsers.size > 0 && (
                <div className="uploading-indicator">
                  Загружаются файлы: {Array.from(uploadingUsers.values()).join(', ')}
                </div>
              )}
            </div>

            <div className="message-input-area" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
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
                <label className="file-upload-label">
                  📎 Файл
                  <input
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    hidden
                  />
                </label>
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
