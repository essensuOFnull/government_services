import React from 'react';

export default function Message({ msg, fileMeta = new Map()}) {
  const files = msg.file_ids || [];

  const formatTime = (val) => {
    try {
      const d = new Date(val);
      return d.toLocaleString('ru-RU');
    } catch (e) { return '' + val; }
  };

  return (
    <div className="message">
      <strong>{msg.sender_username}:</strong>
      <div className="message-content">{msg.content}</div>

      {files.length > 0 && (
        <div className="message-files">
          {files.map(fileId => {
            const meta = fileMeta.get(fileId) || {};
            const mime = meta.mime_type || '';
            const s3url = meta.s3Url || `/api/messenger/download-file/${fileId}`;

            const isImage = mime.startsWith('image/');
            const isVideo = mime.startsWith('video/');
            const isAudio = mime.startsWith('audio/');
            const isText = mime.startsWith('text/') || mime === 'application/json';

            return (
              <div key={fileId} className="file-item">
                {isImage && (
                  <img src={s3url} alt={meta.original_filename || 'image'} className="file-preview" />
                )}
                {isVideo && (
                  <video src={s3url} controls className="file-preview" />
                )}
                {isAudio && (
                  <audio src={s3url} controls className="file-audio" />
                )}
                {(!isImage && !isVideo && !isAudio) && (
                  <div className="file-generic">
                    <img src="/public/file-icon.png" alt="file" style={{width:48,height:48}} />
                    <div>{meta.original_filename || fileId}</div>
                  </div>
                )}

                <div className="file-actions">
                  <a href={`/api/messenger/download-file/${fileId}`} className="download-btn">Скачать</a>
                  {(!isText) && (
                    <a href={s3url} target="_blank" rel="noreferrer" className="open-btn">Открыть</a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <small>{formatTime(msg.created_at)}</small>
    </div>
  );
}
