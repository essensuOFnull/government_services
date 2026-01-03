import React from 'react';
import FileItem from './FileItem';
import Avatar from './Avatar';
import { useAuthContext } from './auth/AuthContext';

export default function Message({ msg, fileMeta = new Map(), users = new Map(), onDelete }) {
  const files = msg.file_ids || [];
  const { user } = useAuthContext();

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
      <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
        <Avatar 
          userId={senderId}
          username={senderName}
          size={32}
        />
        <div>
          <strong>{senderName}</strong>
          <div className="message-content">{msg.content}</div>
        </div>
      </div>

      {(user && (user.id === msg.sender_username || user.username === msg.sender_username || user.id === msg.sender_id)) && (
        <div className="message-controls">
          <button onClick={async () => {
            if (!confirm('Удалить сообщение? Это действие нельзя отменить.')) return;
            try {
              const resp = await fetch(`/api/messenger/delete-message/${msg.id}`, { method: 'DELETE', headers: { 'x-user-id': user.id } });
              const j = await resp.json();
              if (resp.ok && j.success) {
                if (typeof onDelete === 'function') onDelete(msg.id, j.storageInfo);
              } else {
                alert(j.message || 'Не удалось удалить сообщение');
              }
            } catch (e) {
              console.error('delete message error', e);
              alert('Ошибка удаления сообщения');
            }
          }}>Удалить</button>
        </div>
      )}

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
