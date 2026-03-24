import React, { useState, useEffect, useRef } from 'react';

export default function Avatar({
  userId,
  username,
  size = 40,
  style = {},
  cacheEnabled,
  getCachedFile,
  saveToCache
}) {
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const urlRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    if (!userId) return;

    const loadAvatar = async () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }

      setLoaded(false);
      setAvatarUrl(null);

      const key = `avatar_${userId}`;

      try {
        // 1. Пытаемся получить из кэша
        if (cacheEnabled && getCachedFile) {
          const cachedUrl = await getCachedFile(key);
          if (cachedUrl) {
            urlRef.current = cachedUrl;
            setAvatarUrl(cachedUrl);
            setLoaded(true);
            console.log('Avatar loaded from cache:', key);
            return;
          }
        }

        // 2. Загружаем с сервера
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const response = await fetch(`/api/messenger/avatar/${encodeURIComponent(userId)}`, {
          signal: controller.signal
        });

        if (!response.ok) {
          if (response.status === 404) {
            setLoaded(false);
          } else {
            throw new Error(`HTTP ${response.status}`);
          }
          return;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setAvatarUrl(url);
        setLoaded(true);
        console.log('Avatar loaded from server:', key);

        // 3. Сохраняем в кэш
        if (cacheEnabled && saveToCache) {
          await saveToCache(key, blob);
          console.log('Avatar saved to cache:', key);
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Ошибка загрузки аватарки:', error);
          setLoaded(false);
        }
      }
    };

    loadAvatar();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [userId, cacheEnabled, getCachedFile, saveToCache]);

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