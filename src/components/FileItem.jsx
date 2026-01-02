import React from 'react';
import { useWindowsManager } from '../hooks/useWindowsManager';
export default function FileItem({ fileId, fileMeta = {} }) {
  const { openWindow, closeWindow } = useWindowsManager();

  const mime = fileMeta.mime_type || '';
  const s3url = fileMeta.s3Url || `/api/messenger/download-file/${fileId}`;
  const filename = fileMeta.original_filename || fileId;

  const isImage = mime.startsWith('image/');
  const isVideo = mime.startsWith('video/');
  const isAudio = mime.startsWith('audio/');
  const isText = mime.startsWith('text/') || mime === 'application/json';

  const handleDownload = () => {
    // Create a link and trigger download
    const link = document.createElement('a');
    link.href = `/api/messenger/download-file/${fileId}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpen = () => {
    // Open file in new window
    openWindow({
        title: fileMeta.original_filename,
        children: <FileItem fileId={fileId} fileMeta={fileMeta}/>,
    })
  };

  return (
    <div className="file-item">
      {isImage && (
        <img src={s3url} alt={filename} className="file-preview" />
      )}
      {isVideo && (
        <video src={s3url} controls className="file-preview" />
      )}
      {isAudio && (
        <audio src={s3url} controls className="file-audio" />
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
