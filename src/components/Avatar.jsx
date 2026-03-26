import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAvatarCache } from '../contexts/AvatarCacheContext';

export default function Avatar({
  userId,
  username,
  size = 40,
  style = {},
  cacheEnabled = true,
  getCachedFile, // можно оставить для совместимости, но будем использовать контекст
  saveToCache,
}) {
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const urlRef = useRef(null);
  const abortControllerRef = useRef(null);
  const cache = useAvatarCache();

  // Функция загрузки с сервера
  const loadFromServer = useCallback(async (userId, signal) => {
    const response = await fetch(`/api/messenger/avatar/${encodeURIComponent(userId)}`, {
      signal,
      headers: {
        // Можно добавить If-Modified-Since, если сервер поддерживает
      }
    });
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const timestamp = response.headers.get('Last-Modified') || Date.now().toString();
    return { blob, timestamp };
  }, []);

  // Загрузка аватарки (с учётом кэша и фонового обновления)
  const loadAvatar = useCallback(async (userId, forceRefresh = false) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }

    setLoaded(false);
    setAvatarUrl(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let blob = null;
      let timestamp = null;

      // 1. Проверяем кэш, если не принудительное обновление
      if (!forceRefresh && cacheEnabled && cache.getCachedBlob) {
        const cached = cache.getCachedBlob(userId);
        if (cached) {
          blob = cached;
          // показываем кэш сразу
          const url = URL.createObjectURL(blob);
          urlRef.current = url;
          setAvatarUrl(url);
          setLoaded(true);
        }
      }

      // 2. Фоновый запрос для проверки актуальности (всегда, если нет forceRefresh)
      // Если forceRefresh = true, то не показываем кэш, а грузим заново
      if (!forceRefresh && blob) {
        // Загружаем свежие данные в фоне, но без ожидания
        loadFromServer(userId, controller.signal)
          .then(async (result) => {
            if (result && result.blob) {
              // Сравниваем blob? Можно по размеру/хешу, но проще по timestamp
              // Если изменился, обновляем
              if (!blob || blob.size !== result.blob.size) {
                // Обновляем кэш и отображение
                const newUrl = URL.createObjectURL(result.blob);
                // заменяем старый URL
                if (urlRef.current) {
                  URL.revokeObjectURL(urlRef.current);
                }
                urlRef.current = newUrl;
                setAvatarUrl(newUrl);
                cache.setCachedBlob(userId, result.blob, result.timestamp);
              }
            }
          })
          .catch(err => {
            if (err.name !== 'AbortError') console.error('Фоновая проверка аватарки:', err);
          });
        return;
      }

      // 3. Нет кэша или forceRefresh — грузим синхронно
      const result = await loadFromServer(userId, controller.signal);
      if (result && result.blob) {
        const url = URL.createObjectURL(result.blob);
        urlRef.current = url;
        setAvatarUrl(url);
        setLoaded(true);
        if (cacheEnabled && cache.setCachedBlob) {
          cache.setCachedBlob(userId, result.blob, result.timestamp);
        }
      } else {
        setLoaded(false);
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Ошибка загрузки аватарки:', error);
        setLoaded(false);
      }
    }
  }, [cacheEnabled, cache, loadFromServer]);

  // Подписка на обновления аватарки через WebSocket
  useEffect(() => {
    if (!userId || !cache.subscribe) return;

    const handleAvatarUpdate = (updatedUserId) => {
      if (updatedUserId === userId) {
        // Принудительно обновляем, игнорируя кэш
        loadAvatar(userId, true);
      }
    };

    const unsubscribe = cache.subscribe(userId, handleAvatarUpdate);
    return unsubscribe;
  }, [userId, cache.subscribe, loadAvatar]);

  // Основная загрузка при изменении userId
  useEffect(() => {
    if (!userId) return;
    loadAvatar(userId);
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [userId, loadAvatar]);

  const initials = username ? username.charAt(0).toUpperCase() : '?';

  const getColorFromUserId = (id) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = ((hash << 5) - hash) + id.charCodeAt(i);
      hash = hash & hash;
    }
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1',
      '#FFA07A', '#98D8C8', '#F7DC6F',
      '#BB8FCE', '#85C1E2', '#F8B88B',
      '#A9DFBF'
    ];
    return colors[Math.abs(hash) % colors.length];
  };

  const bgColor = getColorFromUserId(userId || '');

  const containerStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
    borderRadius: 0,
    backgroundColor: loaded ? 'transparent' : bgColor,
    overflow: 'hidden',
    flexShrink: 0,
    ...style
  };

  if (loaded && avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={username}
        style={{
          ...containerStyle,
          width: size,
          height: size,
          objectFit: 'cover'
        }}
      />
    );
  }

  return (
    <div style={containerStyle}>
      <span style={{
        fontSize: size * 0.4,
        fontWeight: 'bold',
        color: 'white',
        userSelect: 'none'
      }}>
        {initials}
      </span>
    </div>
  );
}