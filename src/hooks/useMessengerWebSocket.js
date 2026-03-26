import { useRef, useEffect, useCallback } from 'react';

export function useMessengerWebSocket(userId, onMessage) {
  const wsRef = useRef(null);

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
      try {
        const message = JSON.parse(event.data);
        onMessage(message);
      } catch (err) {
        console.error('Ошибка парсинга сообщения WebSocket:', err);
      }
    });

    wsRef.current.addEventListener('close', () => {
      console.log('❌ WebSocket отключен');
    });

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [userId, onMessage]);

  const send = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket не открыт, сообщение не отправлено');
    }
  }, []);

  return { send, wsRef };
}