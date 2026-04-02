import { useState, useEffect, useCallback } from 'react';

export function useConversations(userId) {
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});

  // Загрузка списка разговоров
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

    if (userId) fetchConversations();
  }, [userId]);

  // Создание разговора с пользователем
  const createConversation = useCallback(async (participantIds) => {
    try {
      const res = await fetch('/api/messenger/conversation/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ participantIds })
      });
      const j = await res.json();
      if (j.success && j.conversation) {
        const exists = conversations.some(c => c.id === j.conversation.id);
        if (!exists) setConversations(prev => [...prev, j.conversation]);
        return j.conversation;
      }
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [userId, conversations]);

  // Открыть/создать "Избранное" (личный чат)
  const openFavorites = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch('/api/messenger/conversation/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({
          participantIds: [userId],
          forceNew: true
        })
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
          setConversations(prev => [...prev, newConversation]);
        }
        return j.conversation;
      }
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [userId, conversations]);

  // Очистка чата (удаление всех своих сообщений и выход)
  const clearChat = useCallback(async (conversationId) => {
    const confirmClear = window.confirm(
      'Вы уверены, что хотите удалить ВСЕ свои сообщения в этом чате и выйти из него?\nЭто действие необратимо, ваши сообщения и файлы будут удалены для всех.'
    );
    if (!confirmClear) return false;

    try {
      const response = await fetch('/api/messenger/clear-chat', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify({ conversationId })
      });
      const data = await response.json();
      if (data.success) {
        setConversations(prev => prev.filter(c => c.id !== conversationId));
        if (currentConversation?.id === conversationId) {
          setCurrentConversation(null);
        }
        return true;
      } else {
        alert('Ошибка при очистке чата: ' + data.message);
        return false;
      }
    } catch (error) {
      console.error('Ошибка очистки чата:', error);
      alert('Ошибка сервера');
      return false;
    }
  }, [userId, currentConversation]);

  // Обработка удаления разговора через WebSocket
  const handleConversationDeleted = useCallback((conversationId) => {
    setConversations(prev => prev.filter(c => c.id !== conversationId));
    if (currentConversation?.id === conversationId) {
      setCurrentConversation(null);
    }
  }, [currentConversation]);

  const handleChatCleared = useCallback((conversationId) => {
    setConversations(prev => prev.filter(c => c.id !== conversationId));
    if (currentConversation?.id === conversationId) {
      setCurrentConversation(null);
    }
  }, [currentConversation]);

  // Увеличение счетчика непрочитанных для разговора, не являющегося текущим
  const incrementUnreadCount = useCallback((conversationId) => {
    if (currentConversation?.id !== conversationId) {
      setUnreadCounts(prev => ({
        ...prev,
        [conversationId]: (prev[conversationId] || 0) + 1
      }));
    }
  }, [currentConversation]);

  // Сброс непрочитанных при открытии разговора
  const resetUnreadCount = useCallback((conversationId) => {
    setUnreadCounts(prev => {
      const newCounts = { ...prev };
      delete newCounts[conversationId];
      return newCounts;
    });
  }, []);

  return {
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
  };
}