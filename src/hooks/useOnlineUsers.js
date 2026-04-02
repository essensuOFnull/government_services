import { useState, useCallback } from 'react';

export function useOnlineUsers() {
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  const handleUserStatusChanged = useCallback((userId, status) => {
    if (status === 'online') {
      setOnlineUsers(prev => new Set([...prev, userId]));
    } else {
      setOnlineUsers(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }, []);

  return { onlineUsers, handleUserStatusChanged };
}