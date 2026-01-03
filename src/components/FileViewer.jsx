import React, { useEffect, useState } from 'react';
import { useAuthContext } from './auth/AuthContext';

export default function FileViewer({ fileId, fileMeta = {} }) {
  const { user } = useAuthContext();
  const userId = user?.userId;
  const [dataUrl, setDataUrl] = useState(null);
  const [textContent, setTextContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const mime = fileMeta.mime_type || '';
  const s3url = fileMeta.s3Url || `/api/messenger/download-file/${fileId}`;

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      try {
        const resp = await fetch(s3url, { headers: { 'x-user-id': userId } });
        if (!resp.ok) throw new Error('Не удалось получить файл');

        if (mime.startsWith('text/') || mime === 'application/json') {
          const txt = await resp.text();
          if (!mounted) return;
          setTextContent(txt);
        } else {
          const blob = await resp.blob();
          if (!mounted) return;
          const reader = new FileReader();
          reader.onloadend = () => {
            if (!mounted) return;
            setDataUrl(reader.result);
          };
          reader.readAsDataURL(blob);
        }
      } catch (err) {
        console.error('FileViewer fetch error', err);
        if (mounted) setError(err.message || 'Ошибка');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [s3url, userId, mime]);

  if (loading) return <div className="file-viewer-loading">Загрузка файла...</div>;
  if (error) return <div className="file-viewer-error">Ошибка: {error}</div>;

  // Render full-size viewer without controls other than native media controls
  if (mime.startsWith('image/')) {
    return <img src={dataUrl} alt={fileMeta.original_filename || fileId} style={{ maxWidth: '100%', maxHeight: '100%' }} />;
  }

  if (mime.startsWith('video/')) {
    return <video src={dataUrl} controls style={{ width: '100%', height: '100%' }} />;
  }

  if (mime.startsWith('audio/')) {
    return <audio src={dataUrl} controls style={{ width: '100%' }} />;
  }

  if (mime.startsWith('text/') || mime === 'application/json') {
    return <pre className="file-viewer-text" style={{ whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: '100%' }}>{textContent}</pre>;
  }

  // Fallback: show message and filename
  return <div className="file-viewer-generic">Файл: {fileMeta.original_filename || fileId}</div>;
}
