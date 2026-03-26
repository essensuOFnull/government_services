import { useState, useCallback } from 'react';

export function useUsers() {
  const [users, setUsers] = useState(new Map());

  const setUser = useCallback((userId, userData) => {
    setUsers(prev => {
      const updated = new Map(prev);
      updated.set(userId, userData);
      return updated;
    });
  }, []);

  const getUser = useCallback((userId) => {
    return users.get(userId);
  }, [users]);

  // Обновление нескольких пользователей
  const setUsersBatch = useCallback((userMap) => {
    setUsers(prev => {
      const updated = new Map(prev);
      userMap.forEach((value, key) => updated.set(key, value));
      return updated;
    });
  }, []);

  return { users, setUser, getUser, setUsersBatch };
}