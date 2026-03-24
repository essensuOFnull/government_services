import React, { useEffect, useState } from 'react';
import { useWindowsManager } from '../hooks/useWindowsManager';
import { useAuthContext } from './auth/AuthContext';
import FileViewer from './FileViewer';
import { saveWallpaper, applyWallpaper } from '../utils/wallpaperUtils';

export default function FileItem({
  fileId,
  fileMeta = {},
  cacheEnabled,
  getCachedFile,
  saveToCache,
  userId: propUserId,
}) {
  const { openWindow, closeWindow } = useWindowsManager();
  const { user } = useAuthContext();
  const userId = propUserId || user?.id;
  const [previewUrl, setPreviewUrl] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const mime = fileMeta.mime_type || '';
  const s3url = fileMeta.s3Url || `/api/messenger/download-file/${fileId}`;
  const filename = fileMeta.original_filename || fileId;

  const isImage = mime.startsWith('image/');
  const isVideo = mime.startsWith('video/');
  const isAudio = mime.startsWith('audio/');
  const isText = mime.startsWith('text/') || mime === 'application/json';

  // Загрузка файла с прогрессом
  const loadFileWithProgress = (url, key, onProgress) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.setRequestHeader('x-user-id', userId);
      xhr.responseType = 'blob';
      xhr.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress((e.loaded / e.total) * 100);
        }
      };
      xhr.onload = () => {
        if (xhr.status === 200) {
          const blob = xhr.response;
          const objectUrl = URL.createObjectURL(blob);
          if (cacheEnabled && saveToCache) {
            saveToCache(key, blob).catch(console.error);
          }
          resolve(objectUrl);
        } else {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send();
    });
  };

  // Загрузка превью
  useEffect(() => {
    let active = true;
    if (!(isImage || isVideo || isAudio) || !userId) return;

    (async () => {
      const key = `preview_${fileId}`;
      try {
        // Проверка кэша
        if (cacheEnabled && getCachedFile) {
          const cachedUrl = await getCachedFile(key);
          if (cachedUrl && active) {
            setPreviewUrl(cachedUrl);
            return;
          }
        }

        // Получение токена для превью
        const tokenResp = await fetch(`/api/messenger/preview-token/${fileId}`, {
          method: 'POST',
          headers: { 'x-user-id': userId },
        });
        const j = await tokenResp.json();
        if (!tokenResp.ok || !j.success || !j.token) {
          console.error('Failed to get preview token', j);
          return;
        }
        const token = j.token;
        const url = `/api/messenger/preview/${fileId}?token=${encodeURIComponent(token)}`;

        // Загрузка с прогрессом
        setIsDownloading(true);
        const objectUrl = await loadFileWithProgress(url, key, (progress) => {
          setDownloadProgress(progress);
        });
        if (active) {
          setPreviewUrl(objectUrl);
        }
      } catch (err) {
        console.error('Preview error', err);
      } finally {
        if (active) {
          setIsDownloading(false);
          setDownloadProgress(null);
        }
      }
    })();

    return () => {
      active = false;
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [fileId, userId, isImage, isVideo, isAudio, cacheEnabled, getCachedFile, saveToCache]);

  // Скачивание файла (также с прогрессом, опционально)
  const handleDownload = async () => {
    try {
      const key = `file_${fileId}`;
      let url = null;

      if (cacheEnabled && getCachedFile) {
        url = await getCachedFile(key);
      }

      if (!url) {
        setIsDownloading(true);
        url = await loadFileWithProgress(s3url, key, (progress) => {
          setDownloadProgress(progress);
        });
      }

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (url.startsWith('blob:')) {
        setTimeout(() => URL.revokeObjectURL(url), 100);
      }
    } catch (e) {
      console.error('Download error', e);
      alert('Не удалось скачать файл');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(null);
    }
  };

  // Загрузка файла (для скачивания или предпросмотра)
  const loadFile = async (url, key) => {
    if (cacheEnabled && getCachedFile) {
      const cachedUrl = await getCachedFile(key);
      if (cachedUrl) return cachedUrl;
    }

    const response = await fetch(url, { headers: { 'x-user-id': userId } });
    if (!response.ok) throw new Error('Failed to fetch file');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    if (cacheEnabled && saveToCache) {
      await saveToCache(key, blob);
    }

    return objectUrl;
  };

  // Предпросмотр
  useEffect(() => {
    let active = true;
    let token = null;
    if (!(isImage || isVideo || isAudio) || !userId) return undefined;

    (async () => {
      const key = `preview_${fileId}`;
      try {
        if (cacheEnabled && getCachedFile) {
          const cachedUrl = await getCachedFile(key);
          if (cachedUrl && active) {
            setPreviewUrl(cachedUrl);
            return;
          }
        }

        const tokenResp = await fetch(`/api/messenger/preview-token/${fileId}`, {
          method: 'POST',
          headers: { 'x-user-id': userId }
        });
        const j = await tokenResp.json();
        if (!tokenResp.ok || !j.success || !j.token) {
          console.error('Failed to get preview token', j);
          return;
        }
        token = j.token;
        const url = `/api/messenger/preview/${fileId}?token=${encodeURIComponent(token)}`;
        const blob = await fetch(url, { headers: { 'x-user-id': userId } }).then(r => r.blob());
        const objectUrl = URL.createObjectURL(blob);
        if (active) setPreviewUrl(objectUrl);

        if (cacheEnabled && saveToCache) {
          await saveToCache(key, blob);
        }
      } catch (err) {
        console.error('Preview error', err);
      }
    })();

    return () => {
      active = false;
      setPreviewUrl(null);
      if (token) {
        fetch(`/api/messenger/preview-release/${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'x-user-id': userId }
        }).catch(() => {});
      }
    };
  }, [fileId, userId, isImage, isVideo, isAudio, cacheEnabled, getCachedFile, saveToCache]);

  const handleOpen = () => {
    openWindow({
      title: fileMeta.original_filename || filename,
      children: <FileViewer fileId={fileId} fileMeta={fileMeta} />,
    });
  };

  const setWallpaper = (url, type) => {
    const existing = document.getElementById('wallpaper-container');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'wallpaper-container';
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.zIndex = '-1';
    container.style.pointerEvents = 'none';

    if (type === 'image') {
      container.style.backgroundImage = `url(${url})`;
      container.style.backgroundSize = 'cover';
      container.style.backgroundPosition = 'center';
      container.style.backgroundRepeat = 'no-repeat';
    } else if (type === 'video') {
      const video = document.createElement('video');
      video.src = url;
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';
      container.appendChild(video);
    }

    document.body.appendChild(container);
  };

  const handleSetWallpaper = () => {
    if (isImage && previewUrl) {
      saveWallpaper('image', previewUrl);
      applyWallpaper('image', previewUrl);
    } else if (isVideo && previewUrl) {
      saveWallpaper('video', previewUrl);
      applyWallpaper('video', previewUrl);
    }
  };

  return (
    <div className="file-item">
      <hr/>
      {isDownloading && downloadProgress !== null && (
        <div className="progress-indicator">
          <span className="progress-indicator-bar" style={{ width: `${downloadProgress}%` }} />
        </div>
      )}
      {isImage && (
        previewUrl ? (
          <img src={previewUrl} alt={filename} className="file-preview" />
        ) : (
          <div className="file-loading">Загрузка изображения...</div>
        )
      )}
      {isVideo && (
        previewUrl ? (
          <video src={previewUrl} controls className="file-preview" />
        ) : (
          <div className="file-loading">Загрузка видео...</div>
        )
      )}
      {isAudio && (
        previewUrl ? (
          <audio src={previewUrl} controls className="file-audio"/>
        ) : (
          <div className="file-loading">Загрузка аудио...</div>
        )
      )}
      {(!isImage && !isVideo && !isAudio) && (
        <div className="file-generic">
          <img src="/public/file-icon.png" alt="file" style={{ width: 48, height: 48 }} />
          <div>{filename}</div>
        </div>
      )}

      <div className="file-actions">
        <button onClick={handleDownload} className="download-btn" disabled={isDownloading}>
          {isDownloading ? 'Загрузка...' : '💾'}
        </button>
        {(!isText) && (
          <button onClick={handleOpen} className="open-btn">
            👁️
          </button>
        )}
        {(isImage || isVideo) && previewUrl && (
          <button onClick={handleSetWallpaper} className="wallpaper-btn">
            🖼️
          </button>
        )}
      </div>
      <hr/>
    </div>
  );
}