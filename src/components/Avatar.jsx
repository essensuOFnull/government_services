import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAvatarCache } from '../contexts/AvatarCacheContext';

export default function Avatar({ userId, username, size = 40, style = {}, cacheEnabled = true }) {
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const currentUrlRef = useRef(null);
  const pendingUrlRef = useRef(null);
  const abortControllerRef = useRef(null);
  const cache = useAvatarCache();

  const loadFromServer = useCallback(async (userId, signal) => {
    const url = `/api/messenger/avatar/${encodeURIComponent(userId)}?t=${Date.now()}`;
    const response = await fetch(url, { signal });
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const timestamp = response.headers.get('Last-Modified') || Date.now().toString();
    return { blob, timestamp };
  }, []);

  const loadAvatar = useCallback(async (userId, forceRefresh = false) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();

    setLoaded(false);
    if (currentUrlRef.current) {
      pendingUrlRef.current = currentUrlRef.current;
      currentUrlRef.current = null;
    }
    setAvatarUrl(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Принудительное обновление: инвалидируем кэш
      if (forceRefresh && cacheEnabled && cache.invalidateCache) {
        cache.invalidateCache(userId);
      }

      // Если forceRefresh, не используем кэш
      let blob = null;
      if (!forceRefresh && cacheEnabled && cache.getCachedBlob) {
        blob = cache.getCachedBlob(userId);
      }

      if (blob) {
        const url = URL.createObjectURL(blob);
        currentUrlRef.current = url;
        setAvatarUrl(url);
        setLoaded(true);
        return;
      }

      const result = await loadFromServer(userId, controller.signal);
      if (result?.blob) {
        const url = URL.createObjectURL(result.blob);
        pendingUrlRef.current = currentUrlRef.current;
        currentUrlRef.current = url;
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

  const loadAvatarRef = useRef(loadAvatar);
  useEffect(() => {
    loadAvatarRef.current = loadAvatar;
  }, [loadAvatar]);

  const handleImageLoad = useCallback(() => {
    if (pendingUrlRef.current) {
      URL.revokeObjectURL(pendingUrlRef.current);
      pendingUrlRef.current = null;
    }
  }, []);

  const handleImageError = useCallback(() => {
    if (currentUrlRef.current && !loaded) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = pendingUrlRef.current;
      pendingUrlRef.current = null;
      if (currentUrlRef.current) {
        setAvatarUrl(currentUrlRef.current);
        setLoaded(true);
      }
    }
  }, [loaded]);

  useEffect(() => {
    if (!userId) return;
    loadAvatar(userId);
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
      if (pendingUrlRef.current) URL.revokeObjectURL(pendingUrlRef.current);
    };
  }, [userId, loadAvatar]);

  useEffect(() => {
    if (!userId || !cache.subscribe) return;

    const handleUpdate = (updatedUserId) => {
      console.log('Avatar cache update received for', updatedUserId, 'current userId', userId);
      if (updatedUserId === userId) {
        loadAvatarRef.current(userId, true);
      }
    };

    const unsubscribe = cache.subscribe(userId, handleUpdate);
    return unsubscribe;
  }, [userId, cache.subscribe]);

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
        onLoad={handleImageLoad}
        onError={handleImageError}
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