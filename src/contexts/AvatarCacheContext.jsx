import React, { createContext, useContext, useRef, useCallback } from 'react';

const AvatarCacheContext = createContext();

export const useAvatarCache = () => useContext(AvatarCacheContext);

export const AvatarCacheProvider = ({ children }) => {
  const blobCacheRef = useRef({});          // userId -> { blob, timestamp }
  const subscribersRef = useRef(new Map()); // userId -> Set(callback)

  const getCachedBlob = useCallback((userId) => {
    const cached = blobCacheRef.current[userId];
    return cached ? cached.blob : null;
  }, []);

  const setCachedBlob = useCallback((userId, blob, timestamp) => {
    blobCacheRef.current[userId] = { blob, timestamp };
    // НЕ вызываем уведомления здесь, только сохраняем
  }, []);

  const invalidateCache = useCallback((userId) => {
    delete blobCacheRef.current[userId];
  }, []);

  const notifyUpdate = useCallback((userId) => {
    const callbacks = subscribersRef.current.get(userId);
    if (callbacks) {
      callbacks.forEach(cb => cb(userId));
    }
  }, []);

  const subscribe = useCallback((userId, callback) => {
    if (!subscribersRef.current.has(userId)) {
      subscribersRef.current.set(userId, new Set());
    }
    subscribersRef.current.get(userId).add(callback);

    return () => {
      const callbacks = subscribersRef.current.get(userId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          subscribersRef.current.delete(userId);
        }
      }
    };
  }, []);

  const value = {
    getCachedBlob,
    setCachedBlob,
    invalidateCache,
    notifyUpdate,
    subscribe,
  };

  return (
    <AvatarCacheContext.Provider value={value}>
      {children}
    </AvatarCacheContext.Provider>
  );
};