import React, { useEffect, useState } from 'react';
import { useWindowsManager } from '../hooks/useWindowsManager';
import { useAuthContext } from './auth/AuthContext';
export default function FileItem({ fileId, fileMeta = {} }) {
  const { openWindow, closeWindow } = useWindowsManager();
  const { user } = useAuthContext();
  const userId = user?.userId;
  const [previewUrl, setPreviewUrl] = useState(null);

  const mime = fileMeta.mime_type || '';
  const s3url = fileMeta.s3Url || `/api/messenger/download-file/${fileId}`;
  const filename = fileMeta.original_filename || fileId;

  const isImage = mime.startsWith('image/');
  const isVideo = mime.startsWith('video/');
  const isAudio = mime.startsWith('audio/');
  const isText = mime.startsWith('text/') || mime === 'application/json';

  const handleDownload = () => {
    // Fetch file with authentication header and trigger download
    (async () => {
      try {
        const resp = await fetch(s3url, { headers: { 'x-user-id': userId } });
        if (!resp.ok) throw new Error('Download failed');
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error('Download error', e);
        alert('Не удалось скачать файл');
      }
    })();
  };

  const handleOpen = () => {
    // Open file in new window
    openWindow({
        title: fileMeta.original_filename,
        children: <FileItem fileId={fileId} fileMeta={fileMeta}/>,
    })
  };

  useEffect(() => {
    // For media previews, fetch via authenticated request and create object URL
    let active = true;
    let objUrl = null;

    const shouldFetch = (isImage || isVideo || isAudio) && userId;
    if (!shouldFetch) return undefined;

    (async () => {
      try {
        const resp = await fetch(s3url, { headers: { 'x-user-id': userId } });
        if (!resp.ok) throw new Error('Preview fetch failed');
        const blob = await resp.blob();
        objUrl = URL.createObjectURL(blob);
        if (active) setPreviewUrl(objUrl);
      } catch (err) {
        console.error('Preview load error', err);
      }
    })();

    return () => {
      active = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
      setPreviewUrl(null);
    };
  }, [s3url, userId, isImage, isVideo, isAudio]);

  return (
    <div className="file-item">
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
          <audio src={previewUrl} controls className="file-audio" />
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
        <button onClick={handleDownload} className="download-btn">
          Скачать
        </button>
        {(!isText) && (
          <button onClick={handleOpen} className="open-btn">
            Открыть
          </button>
        )}
      </div>
    </div>
  );
}
