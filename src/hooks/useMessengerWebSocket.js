import { useRef, useEffect, useCallback } from 'react';
import { useAvatarCache } from '../contexts/AvatarCacheContext';

export function useMessengerWebSocket(userId, onMessage) {
  const wsRef = useRef(null);
  const cache = useAvatarCache();
  const onMessageRef = useRef(onMessage);
  const cacheRef = useRef(cache);

  useEffect(() => {
    onMessageRef.current = onMessage;
    cacheRef.current = cache;
  }, [onMessage, cache]);

  useEffect(() => {
    if (!userId) return;

    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host || `${window.location.hostname}:${window.location.port || 22869}`;
    const wsUrl = `${scheme}://${host}/ws/messenger?userId=${encodeURIComponent(userId)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'avatar_updated') {
          cacheRef.current?.notifyUpdate(data.userId);
        }
        onMessageRef.current(data);
      } catch (err) {
        console.error('Ошибка парсинга сообщения:', err);
      }
    };

    ws.addEventListener('open', () => {});
    ws.addEventListener('message', handleMessage);
    ws.addEventListener('close', () => {});

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [userId]); // теперь зависимость только userId

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket не открыт');
    }
  }, []);

  return { send, wsRef };
}