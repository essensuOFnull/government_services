import { useState, useEffect } from 'react';

export function useStorageInfo(userId) {
  const [storageInfo, setStorageInfo] = useState(null);

  const fetchStorageInfo = async () => {
    if (!userId) return;
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

  useEffect(() => {
    fetchStorageInfo();
    const interval = setInterval(fetchStorageInfo, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [userId]);

  // Функция для обновления storageInfo из WebSocket
  const updateStorageInfo = (newInfo) => {
    setStorageInfo(newInfo);
  };

  return { storageInfo, updateStorageInfo, fetchStorageInfo };
}