import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function StorageFileViewer({ file }) {
  const { user } = useAuth();
  const [previewUrl, setPreviewUrl] = useState(null);
  const { name, path, size, type } = file;
  const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name);
  const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(name);
  const isAudio = /\.(mp3|wav|ogg|flac)$/i.test(name);
  const isText = /\.(txt|md|json|js|html|css|xml|log)$/i.test(name);

  useEffect(() => {
    if (!user) return;

    const fetchPreview = async () => {
      try {
        const tokenResp = await fetch('/api/storage/preview-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': user.id,
          },
          body: JSON.stringify({ path }),
        });
        const data = await tokenResp.json();
        if (data.success) {
          setPreviewUrl(`/api/storage/preview?token=${encodeURIComponent(data.token)}`);
        }
      } catch (err) {
        console.error('Preview token error', err);
      }
    };
    fetchPreview();
  }, [path, user]);

  if (isImage && previewUrl) {
    return <img src={previewUrl} alt={name} style={{ maxWidth: '100%' }} />;
  }
  if (isVideo && previewUrl) {
    return <video src={previewUrl} controls style={{ maxWidth: '100%' }} />;
  }
  if (isAudio && previewUrl) {
    return <audio src={previewUrl} controls />;
  }
  if (isText) {
    // Загружаем текст как обычный файл
    return <TextFileViewer path={path} />;
  }
  return (
    <div>
      <p>Файл: {name}</p>
      <p>Размер: {size} байт</p>
      <button onClick={() => window.open(`/api/storage/download?path=${encodeURIComponent(path)}`, '_blank')}>
        Скачать
      </button>
    </div>
  );
}

function TextFileViewer({ path }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const fetchText = async () => {
      try {
        const res = await fetch(`/api/storage/download?path=${encodeURIComponent(path)}`, {
          headers: { 'x-user-id': user.id },
        });
        const text = await res.text();
        setContent(text);
      } catch (err) {
        setContent('Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    };
    fetchText();
  }, [path, user]);

  if (loading) return <div>Загрузка...</div>;
  return <pre style={{ whiteSpace: 'pre-wrap' }}>{content}</pre>;
}