import React, { useEffect, useState } from 'react';
import { useAuthContext } from './auth/AuthContext';

export default function FileViewer({ fileId, fileMeta = {} }) {
  const { user } = useAuthContext();
  const userId = user?.userId;
  const [srcUrl, setSrcUrl] = useState(null);
  const [textContent, setTextContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const mime = fileMeta.mime_type || '';

  useEffect(() => {
    let mounted = true;
    let token = null;

    (async () => {
      setLoading(true);
      try {
        const tokenResp = await fetch(`/api/messenger/preview-token/${fileId}`, {
          method: 'POST',
          headers: { 'x-user-id': userId }
        });
        const tj = await tokenResp.json();
        if (!tokenResp.ok || !tj.success || !tj.token) throw new Error(tj.message || 'Не удалось получить токен предпросмотра');
        token = tj.token;
        const previewUrl = `/api/messenger/preview/${fileId}?token=${encodeURIComponent(token)}`;

        if (mime.startsWith('text/') || mime === 'application/json') {
          const resp = await fetch(previewUrl);
          if (!resp.ok) throw new Error('Не удалось получить текст');
          const txt = await resp.text();
          if (!mounted) return;
          setTextContent(txt);
        } else {
          if (!mounted) return;
          setSrcUrl(previewUrl);
        }
      } catch (err) {
        console.error('FileViewer fetch error', err);
        if (mounted) setError(err.message || 'Ошибка');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      if (token) {
        fetch(`/api/messenger/preview-release/${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'x-user-id': userId }
        }).catch(() => {});
      }
    };
  }, [fileId, userId, mime]);

  if (loading) return <div className="file-viewer-loading">Загрузка файла...</div>;
  if (error) return <div className="file-viewer-error">Ошибка: {error}</div>;

  if (mime.startsWith('image/')) {
    return <img src={srcUrl} alt={fileMeta.original_filename || fileId} style={{ maxWidth: '100%', maxHeight: '100%' }} />;
  }

  if (mime.startsWith('video/')) {
    return <video src={srcUrl} controls style={{ width: '100%', height: '100%' }} />;
  }

  if (mime.startsWith('audio/')) {
    return <audio src={srcUrl} controls style={{ width: '100%' }} />;
  }

  if (mime.startsWith('text/') || mime === 'application/json') {
    return <pre className="file-viewer-text" style={{ whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: '100%' }}>{textContent}</pre>;
  }

  return <div className="file-viewer-generic">Файл: {fileMeta.original_filename || fileId}</div>;
}
