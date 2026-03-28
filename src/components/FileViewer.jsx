import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function FileViewer({ fileId, fileMeta, file, userId: propUserId }) {
  const { user } = useAuth();
  const userId = propUserId || user?.id;

  // Определяем источник данных
  const isStorageFile = !!file; // если передан объект file
  const id = isStorageFile ? null : fileId;
  const meta = isStorageFile ? file : fileMeta;
  const path = isStorageFile ? file.path : null;

  const [srcUrl, setSrcUrl] = useState(null);
  const [textContent, setTextContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Определение типа файла
  const getFileType = () => {
    if (isStorageFile) {
      const name = file.name;
      const ext = name.split('.').pop().toLowerCase();
      if (/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(name)) return 'image';
      if (/\.(mp4|webm|ogg|mov|mkv|avi|wmv|flv)$/i.test(name)) return 'video';
      if (/\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(name)) return 'audio';
      if (/\.(txt|md|json|js|html|css|xml|log|ini|cfg|conf)$/i.test(name)) return 'text';
      return 'generic';
    } else {
      const mime = meta?.mime_type || '';
      if (mime.startsWith('image/')) return 'image';
      if (mime.startsWith('video/')) return 'video';
      if (mime.startsWith('audio/')) return 'audio';
      if (mime.startsWith('text/') || mime === 'application/json') return 'text';
      return 'generic';
    }
  };

  const fileType = getFileType();
  const ext = isStorageFile ? (file.name.split('.').pop().toLowerCase()) : (meta?.original_filename?.split('.').pop().toLowerCase());

  // Проверка поддержки видео в браузере (для хранилища)
  const isVideoSupported = () => {
    if (!srcUrl) return false;
    const video = document.createElement('video');
    const mimeMap = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      ogg: 'video/ogg',
      mov: 'video/quicktime',
      mkv: 'video/x-matroska',
      avi: 'video/x-msvideo',
      wmv: 'video/x-ms-wmv',
      flv: 'video/x-flv'
    };
    const mime = mimeMap[ext] || '';
    return video.canPlayType(mime) !== '';
  };

  useEffect(() => {
    let mounted = true;
    let token = null;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        if (isStorageFile) {
          // Запрос для хранилища
          const tokenResp = await fetch('/api/storage/preview-token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': userId,
            },
            body: JSON.stringify({ path: file.path }),
          });
          const data = await tokenResp.json();
          if (!tokenResp.ok || !data.success) {
            throw new Error(data.message || 'Не удалось получить токен предпросмотра');
          }
          token = data.token;
          const previewUrl = `/api/storage/preview?token=${encodeURIComponent(token)}`;

          if (fileType === 'text') {
            // Загружаем текст
            const resp = await fetch(`/api/storage/download?path=${encodeURIComponent(file.path)}`, {
              headers: { 'x-user-id': userId },
            });
            if (!resp.ok) throw new Error('Не удалось получить текст');
            const txt = await resp.text();
            if (mounted) setTextContent(txt);
          } else {
            if (mounted) setSrcUrl(previewUrl);
          }
        } else {
          // Запрос для мессенджера
          const tokenResp = await fetch(`/api/messenger/preview-token/${fileId}`, {
            method: 'POST',
            headers: { 'x-user-id': userId },
          });
          const tj = await tokenResp.json();
          if (!tokenResp.ok || !tj.success || !tj.token) {
            throw new Error(tj.message || 'Не удалось получить токен предпросмотра');
          }
          token = tj.token;
          const previewUrl = `/api/messenger/preview/${fileId}?token=${encodeURIComponent(token)}`;

          if (fileType === 'text') {
            const resp = await fetch(previewUrl);
            if (!resp.ok) throw new Error('Не удалось получить текст');
            const txt = await resp.text();
            if (mounted) setTextContent(txt);
          } else {
            if (mounted) setSrcUrl(previewUrl);
          }
        }
      } catch (err) {
        console.error('FileViewer fetch error', err);
        if (mounted) setError(err.message || 'Ошибка загрузки');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      // Освобождаем токен, если он был получен
      if (token) {
        if (isStorageFile) {
          fetch(`/api/storage/preview-release/${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
        } else {
          fetch(`/api/messenger/preview-release/${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
        }
      }
    };
  }, [isStorageFile, fileId, file?.path, userId, fileType]);

  if (loading) return <div className="file-viewer-loading">Загрузка файла...</div>;
  if (error) return <div className="file-viewer-error">Ошибка: {error}</div>;

  // Отображение
  if (fileType === 'image' && srcUrl) {
    return <img src={srcUrl} alt="preview" style={{ maxWidth: '100%', maxHeight: '100%' }} />;
  }

  if (fileType === 'video' && srcUrl) {
    // Для хранилища проверяем поддержку формата
    if (isStorageFile && !isVideoSupported()) {
      return (
        <div>
          <p>Формат видео ({ext}) не поддерживается для встроенного просмотра.</p>
          <button onClick={() => window.open(`/api/storage/download?path=${encodeURIComponent(file.path)}`, '_blank')}>
            Скачать файл
          </button>
        </div>
      );
    }
    return (
      <video
        src={srcUrl}
        controls
        style={{ maxWidth: '100%', maxHeight: '100%' }}
        onError={() => setError('Ошибка воспроизведения видео')}
      />
    );
  }

  if (fileType === 'audio' && srcUrl) {
    return <audio src={srcUrl} controls style={{ width: '100%' }} />;
  }

  if (fileType === 'text' && textContent !== null) {
    return <pre className="file-viewer-text" style={{ whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: '100%' }}>{textContent}</pre>;
  }

  // Для прочих типов или когда нет srcUrl
  return (
    <div className="file-viewer-generic">
      <p>Файл: {isStorageFile ? file.name : (meta?.original_filename || fileId)}</p>
      {!isStorageFile && meta?.size && <p>Размер: {meta.size} байт</p>}
      <button onClick={() => {
        if (isStorageFile) {
          window.open(`/api/storage/download?path=${encodeURIComponent(file.path)}`, '_blank');
        } else {
          window.open(`/api/messenger/download-file/${fileId}`, '_blank');
        }
      }}>
        Скачать
      </button>
    </div>
  );
}