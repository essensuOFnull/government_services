import React, { useEffect, useState } from 'react';
import { useWindowsManager } from '../hooks/useWindowsManager';
import { useAuthContext } from './auth/AuthContext';
import FileViewer from './FileViewer';
export default function FileItem({ fileId, fileMeta = {} }) {
  const { openWindow, closeWindow } = useWindowsManager();
  const { user } = useAuthContext();
  const userId = user?.id;
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
        // Попробуем получить корректное имя из заголовка Content-Disposition (с поддержкой filename*)
        let suggestedName = filename;
        try {
          const cd = resp.headers.get('content-disposition') || '';
          const mStar = /filename\*=(?:UTF-8'')?([^;\n\r]+)/i.exec(cd);
          if (mStar && mStar[1]) {
            suggestedName = decodeURIComponent(mStar[1].trim());
          } else {
            const m = /filename=\"([^\"]+)\"/i.exec(cd);
            if (m && m[1]) suggestedName = m[1];
          }
        } catch (e) { /* ignore */ }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = suggestedName;
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
    // Open file in custom inner window using FileViewer (no extra buttons)
    openWindow({
      title: fileMeta.original_filename || filename,
      children: <FileViewer fileId={fileId} fileMeta={fileMeta} />,
    });
  };

  useEffect(() => {
    let active = true;
    let token = null;
    if (!(isImage || isVideo || isAudio) || !userId) return undefined;

    (async () => {
      try {
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
        if (active) setPreviewUrl(url);
      } catch (err) {
        console.error('Preview token error', err);
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
  }, [fileId, userId, isImage, isVideo, isAudio]);

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
          💾
        </button>
        {(!isText) && (
          <button onClick={handleOpen} className="open-btn">
            👁️
          </button>
        )}
      </div>
    </div>
  );
}
