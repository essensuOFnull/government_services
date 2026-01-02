import React from 'react';
import FileItem from './FileItem';

export default function Message({ msg, fileMeta = new Map(), users = new Map()}) {
  const files = msg.file_ids || [];

  const formatTime = (val) => {
    try {
      const d = new Date(val);
      return d.toLocaleString('ru-RU');
    } catch (e) { return '' + val; }
  };

  const senderId = msg.sender_id || msg.senderId || msg.user_id || (msg.sender && msg.sender.id) || null;
  const senderFromMap = senderId ? users.get(senderId) : null;
  const senderName = (msg.sender_username && msg.sender_username !== 'online:' && msg.sender_username !== 'null')
    ? msg.sender_username
    : (senderFromMap && (senderFromMap.username || senderFromMap.displayName || senderFromMap.name))
      || (msg.sender && (msg.sender.username || msg.sender.name))
    || (senderId ? `пользователь #${senderId.substring(0, 8)}` : 'Неизвестный пользователь');

  return (
    <div className="message">
      <strong>{senderName}:</strong>
      <div className="message-content">{msg.content}</div>

      {files.length > 0 && (
        <div className="message-files">
          {files.map(fileId => (
            <FileItem key={fileId} fileId={fileId} fileMeta={fileMeta.get(fileId) || {}} />
          ))}
        </div>
      )}

      <small>{formatTime(msg.created_at)}</small>
    </div>
  );
}
