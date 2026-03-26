import { useRef, useEffect, useCallback } from 'react';
import { useAvatarCache } from '../contexts/AvatarCacheContext';

export function useMessengerWebSocket(userId, onMessage) {
  const wsRef = useRef(null);
  const cache = useAvatarCache(); // получаем кэш из контекста

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

    // Обработчик для сообщений об обновлении аватарки
    const handleAvatarUpdate = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'avatar_updated') {
          const { userId: updatedUserId } = data;
          cache.notifyUpdate(updatedUserId);
        }
      } catch (err) {
        console.error('Ошибка парсинга сообщения WebSocket:', err);
      }
    };

    wsRef.current.addEventListener('open', () => {
      // можно отправить что-то, если нужно
    });

    wsRef.current.addEventListener('message', (event) => {
      handleAvatarUpdate(event); // сначала обрабатываем аватарки
      try {
        const message = JSON.parse(event.data);
        onMessage(message); // потом передаём дальше
      } catch (err) {
        // уже обработано в handleAvatarUpdate, можно игнорировать
      }
    });

    wsRef.current.addEventListener('close', () => {
      // логика переподключения
    });

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [userId, onMessage, cache]); // добавили cache в зависимости

  const send = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket не открыт, сообщение не отправлено');
    }
  }, []);

  return { send, wsRef };
}