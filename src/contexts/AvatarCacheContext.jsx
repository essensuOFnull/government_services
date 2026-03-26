// AvatarCacheContext.js
import React, { createContext, useContext, useRef, useCallback, useMemo } from 'react';

const AvatarCacheContext = createContext();

export const AvatarCacheProvider = ({ children }) => {
  const cache = useRef(new Map()); // userId -> { blob, timestamp }
  const subscribers = useRef(new Map()); // userId -> Set(listeners)

  const getCachedBlob = useCallback((userId) => {
    const entry = cache.current.get(userId);
    return entry?.blob || null;
  }, []);

  const setCachedBlob = useCallback((userId, blob, timestamp) => {
    cache.current.set(userId, { blob, timestamp });
  }, []);

  const invalidateCache = useCallback((userId) => {
    cache.current.delete(userId);
  }, []);

  const subscribe = useCallback((userId, listener) => {
    if (!subscribers.current.has(userId)) {
      subscribers.current.set(userId, new Set());
    }
    subscribers.current.get(userId).add(listener);
    return () => {
      subscribers.current.get(userId)?.delete(listener);
    };
  }, []);

  const notifyUpdate = useCallback((userId) => {
    const listeners = subscribers.current.get(userId);
    if (listeners) {
      listeners.forEach(listener => listener(userId));
    }
  }, []);

  const value = useMemo(() => ({
    getCachedBlob,
    setCachedBlob,
    invalidateCache,
    subscribe,
    notifyUpdate,
  }), [getCachedBlob, setCachedBlob, invalidateCache, subscribe, notifyUpdate]);

  return (
    <AvatarCacheContext.Provider value={value}>
      {children}
    </AvatarCacheContext.Provider>
  );
};

export const useAvatarCache = () => useContext(AvatarCacheContext);