import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

export function useMessages({
  currentConversation,
  userId,
  wsSend,
  cacheEnabled,
  getCachedFile,
  saveToCache,
}) {
  // Состояния
  const [messages, setMessages] = useState([]);
  const [pendingMessages, setPendingMessages] = useState([]);
  const [fileMeta, setFileMeta] = useState(new Map());
  const [messageInput, setMessageInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [pageSize] = useState(30);

  // Рефы для актуальных значений
  const pendingMessagesRef = useRef(pendingMessages);
  useEffect(() => { pendingMessagesRef.current = pendingMessages; }, [pendingMessages]);

  // Функция обновления конкретного pending сообщения
  const updatePendingMessage = useCallback((localId, updater) => {
    setPendingMessages(prev =>
      prev.map(msg => (msg.localId === localId ? updater(msg) : msg))
    );
  }, []);

  // Загрузка файлов (параллельная с прогрессом)
  const uploadFiles = useCallback(async (files, conversationId, localId) => {
    const uploadFile = (file, index) => {
      return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('files', file);
        formData.append('conversationId', conversationId);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/messenger/upload-files', true);
        xhr.setRequestHeader('x-user-id', userId);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = (e.loaded / e.total) * 100;
            updatePendingMessage(localId, msg => ({
              ...msg,
              progress: {
                ...msg.progress,
                files: { ...msg.progress.files, [index]: percent },
              },
            }));
          }
        };

        xhr.onload = () => {
          if (xhr.status === 200) {
            try {
              const j = JSON.parse(xhr.responseText);
              if (j.success && j.files && j.files[0]) {
                resolve(j.files[0].id);
              } else {
                reject(new Error(j.message || 'Upload failed'));
              }
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error(`HTTP ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(formData);
      });
    };

    const uploadedIds = await Promise.all(
      files.map((file, idx) => uploadFile(file, idx))
    );
    return uploadedIds;
  }, [userId, updatePendingMessage]);

  // Внутренняя функция отправки сообщения (создаёт pending, загружает файлы, отправляет через ws)
  const sendMessageInternal = useCallback(async (content, filesToUpload, customLocalId = null) => {
    const localId = customLocalId || (Date.now() + '-' + Math.random().toString(36));
    if (!content.trim() && filesToUpload.length === 0) return;
    if (!currentConversation?.id) return;

    // Создаём временное сообщение
    const newPending = {
      localId,
      content,
      conversation_id: currentConversation.id,
      sender_id: userId,
      sender_username: userId, // будет заменено при получении реального сообщения
      created_at: new Date().toISOString(),
      file_ids: [],
      files: filesToUpload.map(file => ({ file, progress: 0, id: null })),
      progress: {
        text: 0,
        files: filesToUpload.reduce((acc, _, idx) => ({ ...acc, [idx]: 0 }), {}),
      },
      status: 'uploading_files',
      error: null,
    };
    setPendingMessages(prev => [...prev, newPending]);

    try {
      // Загружаем все файлы
      const uploadedIds = await uploadFiles(filesToUpload, currentConversation.id, localId);

      // Обновляем прогресс текста (сразу 100%) и сохраняем ID файлов
      updatePendingMessage(localId, msg => ({
        ...msg,
        progress: { ...msg.progress, text: 100 },
        file_ids: uploadedIds,
        files: msg.files.map((f, idx) => ({ ...f, id: uploadedIds[idx] })),
        status: 'awaiting_confirm',
      }));

      // Отправляем сообщение через WebSocket с временным ID
      wsSend({
        type: 'send_message',
        data: {
          conversationId: currentConversation.id,
          content,
          fileIds: uploadedIds,
          temporaryId: localId,
        },
      });

      // Таймаут на случай, если ответ не придёт
      setTimeout(() => {
        updatePendingMessage(localId, msg => {
          if (msg.status === 'awaiting_confirm') {
            return { ...msg, status: 'error', error: 'Не удалось отправить сообщение' };
          }
          return msg;
        });
      }, 10000);
    } catch (err) {
      console.error('Upload error:', err);
      updatePendingMessage(localId, msg => ({
        ...msg,
        status: 'error',
        error: err.message,
      }));
    }
  }, [currentConversation, userId, wsSend, uploadFiles, updatePendingMessage]);

  // Обработчик отправки сообщения (вызывается из UI)
  const handleSendMessage = useCallback(async () => {
    const content = messageInput;
    const filesToUpload = [...attachments];
    if (!content.trim() && filesToUpload.length === 0) return;

    setMessageInput('');
    setAttachments([]);
    await sendMessageInternal(content, filesToUpload);
  }, [messageInput, attachments, sendMessageInternal]);

  // Повторная отправка (retry)
  const handleRetry = useCallback((localId) => {
    const pendingMsg = pendingMessages.find(p => p.localId === localId);
    if (!pendingMsg) return;

    const content = pendingMsg.content;
    const filesToUpload = pendingMsg.files.map(f => f.file);

    setPendingMessages(prev => prev.filter(p => p.localId !== localId));
    sendMessageInternal(content, filesToUpload);
  }, [pendingMessages, sendMessageInternal]);

  // Загрузка сообщений для текущего разговора
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
        }
        if (msgs.length < lim) setHasMore(false);
        else setHasMore(true);
        setOffset(prev => prev + msgs.length);
      } catch (error) {
        console.error('Ошибка получения сообщений:', error);
      }
    };

    setOffset(0);
    setMessages([]);
    setHasMore(true);
    fetchMessages(pageSize, 0, false);
  }, [currentConversation, userId, pageSize]);

  // Подгрузка старых сообщений при скролле (функция для useScrollPagination)
  const loadMoreMessages = useCallback(async () => {
	if (!hasMore || !currentConversation) return [];
	try {
		const response = await fetch(
		`/api/messenger/conversation/${currentConversation.id}/messages?limit=${pageSize}&offset=${offset}`,
		{ headers: { 'x-user-id': userId } }
		);
		const data = await response.json();
		const msgs = data.messages || [];
		if (msgs.length > 0) {
		setMessages(prev => {
			const existingIds = new Set(prev.map(m => m.id));
			const uniqueNewMsgs = msgs.filter(msg => !existingIds.has(msg.id));
			if (uniqueNewMsgs.length === 0) return prev;
			return [...uniqueNewMsgs, ...prev];
		});
		setOffset(prev => prev + msgs.length);
		if (msgs.length < pageSize) setHasMore(false);
		return msgs;
		} else {
		setHasMore(false);
		return [];
		}
	} catch (error) {
		console.error('Ошибка загрузки старых сообщений:', error);
		return [];
	}
  }, [currentConversation, hasMore, offset, pageSize, userId]);

  // Обновление метаданных файлов, которых нет в fileMeta
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
  }, [messages, fileMeta, userId]);

  // Объединённый список сообщений (реальные + pending)
  const allMessages = useMemo(() => {
	const real = messages.map(m => ({ ...m, isPending: false }));
	const pending = pendingMessages.map(p => ({
		...p,
		id: p.localId,
		isPending: true,
		created_at: p.created_at,
	}));
	return [...real, ...pending].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [messages, pendingMessages]);

  // Обработка входящих сообщений от WebSocket
  const handleNewMessage = useCallback((msg) => {
	if (msg.temporaryId) {
		const existsInPending = pendingMessagesRef.current.some(p => p.localId === msg.temporaryId);
		if (existsInPending) {
		setPendingMessages(prev => prev.filter(p => p.localId !== msg.temporaryId));
		setMessages(prev => {
			if (prev.some(m => m.id === msg.id)) return prev;
			return [...prev, msg];
		});
		} else {
		if (currentConversation?.id === msg?.conversation_id) {
			setMessages(prev => {
			if (prev.some(m => m.id === msg.id)) return prev;
			return [...prev, msg];
			});
		}
		}
	} else {
		if (currentConversation?.id === msg?.conversation_id) {
		setMessages(prev => {
			if (prev.some(m => m.id === msg.id)) return prev;
			return [...prev, msg];
		});
		}
	}
	return msg;
  }, [currentConversation]);

  const handleMessageDeleted = useCallback((messageId, conversationId) => {
    if (currentConversation?.id === conversationId) {
      setMessages(prev => prev.filter(m => m.id !== messageId));
    }
  }, [currentConversation]);

  const handleMessageRead = useCallback((messageId, userId) => {
    setMessages(prev => prev.map(m => 
      m.id === messageId ? { ...m, readBy: [...(m.readBy || []), userId] } : m
    ));
  }, []);

  const handleUserLeftChat = useCallback((conversationId, userId) => {
    if (currentConversation?.id === conversationId) {
      setMessages(prev => prev.filter(m => m.sender_id !== userId));
    }
  }, [currentConversation]);

  // Вспомогательные функции для UI
  const removeAttachment = useCallback((index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleFileUpload = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !currentConversation?.id) return;
    setAttachments(prev => [...prev, ...files]);
    e.target.value = '';
  }, [currentConversation]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length && currentConversation?.id) {
      setAttachments(prev => [...prev, ...files]);
    }
  }, [currentConversation]);

  return {
    messages,
    pendingMessages,
    fileMeta,
    messageInput,
    setMessageInput,
    attachments,
    setAttachments,
    hasMore,
    offset,
    pageSize,
    allMessages,
    handleSendMessage,
    handleRetry,
    handleNewMessage,
    handleMessageDeleted,
    handleMessageRead,
    handleUserLeftChat,
    removeAttachment,
    handleFileUpload,
    handleDrop,
    loadMoreMessages, // для пагинации
    updatePendingMessage,
    setMessages,
  };
}