import React, { useState, useEffect } from 'react';

export default function Avatar({ userId, username, size = 40, style = {} }) {
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;

    setLoaded(false);
    const img = new Image();
    
    const handleLoad = () => {
      setLoaded(true);
    };

    const handleError = () => {
      setLoaded(false);
      setAvatarUrl(null);
    };

    img.onload = handleLoad;
    img.onerror = handleError;

    // Генерируем URL с версией для кеша
    const url = `/api/messenger/avatar/${encodeURIComponent(userId)}?t=${Date.now()}`;
    img.src = url;
    
    // Устанавливаем URL только если изображение загрузилось
    // (это позволит показать fallback если 404)
    const timer = setTimeout(() => {
      if (img.complete && img.naturalHeight === 0) {
        // Изображение не загрузилось
        setLoaded(false);
      } else if (img.complete) {
        // Изображение загрузилось
        setAvatarUrl(url);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
    };
  }, [userId]);

  const initials = username ? username.charAt(0).toUpperCase() : '?';
  
  // Генерируем цвет на основе userId
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
