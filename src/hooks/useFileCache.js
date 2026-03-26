import { useState, useEffect, useCallback } from 'react';
import { get, set } from 'idb-keyval';

export function useFileCache() {
  const [cacheEnabled, setCacheEnabled] = useState(false);
  const [cacheRoot, setCacheRoot] = useState(null);
  const [isCacheReady, setIsCacheReady] = useState(false);

  // Сохранение handle в IndexedDB
  const saveDirectoryHandle = useCallback(async (handle) => {
    await set('messenger_cache_handle', handle);
  }, []);

  // Получение handle из IndexedDB
  const getDirectoryHandle = useCallback(async () => {
    return await get('messenger_cache_handle');
  }, []);

  // Получить ключ файла (уникальный идентификатор)
  const getCacheKey = useCallback((fileId, extension = '') => {
    return `${fileId}${extension}`;
  }, []);

  // Проверить наличие файла в кэше и вернуть blob URL
  const getCachedFile = useCallback(async (key) => {
    if (!cacheRoot || !cacheEnabled) return null;
    try {
      const fileHandle = await cacheRoot.getFileHandle(key);
      const file = await fileHandle.getFile();
      return URL.createObjectURL(file);
    } catch (err) {
      return null;
    }
  }, [cacheRoot, cacheEnabled]);

  // Сохранить файл в кэш
  const saveToCache = useCallback(async (key, blob) => {
    if (!cacheRoot || !cacheEnabled) return;
    try {
      const fileHandle = await cacheRoot.getFileHandle(key, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (err) {
      console.error('Ошибка сохранения в кэш:', err);
    }
  }, [cacheRoot, cacheEnabled]);

  // Удалить файл из кэша
  const deleteFromCache = useCallback(async (key) => {
    if (!cacheRoot || !cacheEnabled) return;
    try {
      await cacheRoot.removeEntry(key);
    } catch (err) {
      console.error('Ошибка удаления из кэша:', err);
    }
  }, [cacheRoot, cacheEnabled]);

  // Инициализация кэша при монтировании
  useEffect(() => {
    const initCache = async () => {
      if (!window.showDirectoryPicker) {
        console.warn('File System Access API not supported');
        setCacheEnabled(false);
        setIsCacheReady(true);
        return;
      }

      try {
        const savedHandle = await getDirectoryHandle();
        if (savedHandle) {
          await savedHandle.getFileHandle('.test', { create: true });
          setCacheRoot(savedHandle);
          setCacheEnabled(true);
          console.log('Cache restored from IndexedDB');
          setIsCacheReady(true);
          return;
        }
      } catch (err) {
        console.error('Failed to restore cache handle:', err);
      }

      const wantCache = window.confirm(
        'Мессенджер будет работать лучше, а также будет меньше нагрузка на сервера, если вы разрешите кэширование. Разрешить?'
      );
      if (!wantCache) {
        setCacheEnabled(false);
        setIsCacheReady(true);
        localStorage.setItem('messenger_cache_permission', 'denied');
        return;
      }

      alert('Выберите папку, в которую будет производиться кэширование.');
      try {
        const dirHandle = await window.showDirectoryPicker();
        await saveDirectoryHandle(dirHandle);
        setCacheRoot(dirHandle);
        setCacheEnabled(true);
        localStorage.setItem('messenger_cache_permission', 'granted');
      } catch (err) {
        console.error('Ошибка выбора папки:', err);
        setCacheEnabled(false);
        localStorage.setItem('messenger_cache_permission', 'denied');
      }
      setIsCacheReady(true);
    };
    initCache();
  }, [getDirectoryHandle, saveDirectoryHandle]);

  return {
    cacheEnabled,
    cacheRoot,
    isCacheReady,
    getCachedFile,
    saveToCache,
    deleteFromCache,
    getCacheKey,
  };
}