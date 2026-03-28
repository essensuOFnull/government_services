import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function StorageFileViewer({ file }) {
  const { user } = useAuth();
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const { name, path, size, type } = file;
  const ext = name.split('.').pop().toLowerCase();
  
  // Расширенные форматы изображений
  const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(name);
  // Расширенные форматы видео (добавлен mkv)
  const isVideo = /\.(mp4|webm|ogg|mov|mkv|avi|wmv|flv)$/i.test(name);
  // Аудио
  const isAudio = /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(name);
  // Текстовые файлы
  const isText = /\.(txt|md|json|js|html|css|xml|log|ini|cfg|conf)$/i.test(name);

  // Проверка поддержки видео в браузере
  const isVideoSupported = () => {
    if (!previewUrl) return false;
    const video = document.createElement('video');
    // Получаем MIME-тип по расширению
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
    if (!user) return;

    const fetchPreview = async () => {
      try {
        setIsLoading(true);
        setError(null);
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
        } else {
          setError('Не удалось получить ссылку для просмотра');
        }
      } catch (err) {
        console.error('Preview token error', err);
        setError('Ошибка загрузки');
      } finally {
        setIsLoading(false);
      }
    };
    fetchPreview();
  }, [path, user]);

  if (isLoading) return <div>Загрузка...</div>;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;

  if (isImage && previewUrl) {
    return <img src={previewUrl} alt={name} style={{ maxWidth: '100%' }} />;
  }
  
  if (isVideo && previewUrl) {
    // Если браузер не поддерживает формат, показываем сообщение
    if (!isVideoSupported()) {
      return (
        <div>
          <p>Формат видео ({ext}) не поддерживается для встроенного просмотра.</p>
          <button onClick={() => window.open(`/api/storage/download?path=${encodeURIComponent(path)}`, '_blank')}>
            Скачать файл
          </button>
        </div>
      );
    }
    return (
      <video 
        src={previewUrl} 
        controls 
        style={{ maxWidth: '100%', maxHeight: '80vh' }}
        onError={() => setError('Ошибка воспроизведения видео')}
      />
    );
  }
  
  if (isAudio && previewUrl) {
    return (
      <audio 
        src={previewUrl} 
        controls 
        style={{ width: '100%' }}
      />
    );
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