import React from 'react';
import FileItem from './FileItem';
import Avatar from './Avatar';
import { useAuthContext } from './auth/AuthContext';
import ForwardButton from './forward/ForwardButton';

export default function Message({
  msg,
  fileMeta = new Map(),
  users = new Map(),
  onDelete,
  wsRef,
  cacheEnabled,
  getCachedFile,
  saveToCache
}) {
  const files = msg.file_ids || [];
  const { user } = useAuthContext();

  const formatTime = (val) => {
    try {
      const d = new Date(val);
      return d.toLocaleString('ru-RU');
    } catch (e) {
      return '' + val;
    }
  };

  const renderContentWithMentions = (content) => {
    if (!content) return null;
    
    // Разделяем текст на части: обычный текст и упоминания
    const parts = content.split(/(@[a-zA-Z0-9_]+)/g);
    const result = [];

    parts.forEach((part, idx) => {
      // Если часть — упоминание
      if (/^@[a-zA-Z0-9_]+$/.test(part)) {
        const username = part.slice(1);
        result.push(
          <a
            key={`mention-${idx}`}
            href="#"
            className="mention-link"
            onClick={(e) => {
              e.preventDefault();
              window.dispatchEvent(
                new CustomEvent('openUserProfile', {
                  detail: { username },
                })
              );
            }}
          >
            {part}
          </a>
        );
      } 
      // Если это обычный текст (может содержать \n)
      else if (part) {
        const lines = part.split('\n');
        lines.forEach((line, lineIdx) => {
          // Вставляем <br /> между строками (кроме первой)
          if (lineIdx > 0) {
            result.push(<br key={`br-${idx}-${lineIdx}`} />);
          }
          result.push(line); // строка как текст, React экранирует её автоматически
        });
      }
    });

    return result;
  };

  const senderId = msg.sender_id || msg.senderId || msg.user_id ||
    (msg.sender && msg.sender.id) || null;
  const senderFromMap = senderId ? users.get(senderId) : null;

  const senderName = (msg.sender_username &&
    msg.sender_username !== 'online:' &&
    msg.sender_username !== 'null')
    ? msg.sender_username
    : (senderFromMap && (senderFromMap.username ||
      senderFromMap.displayName ||
      senderFromMap.name))
    || (msg.sender && (msg.sender.username || msg.sender.name))
    || (senderId ? `пользователь #${senderId.substring(0, 8)}` :
      'Неизвестный пользователь');

  const isCurrentUser = user &&
    (user.id === senderId ||
      user.username === msg.sender_username);

  return (
    <>
      <hr style={{ width: '100%' }} />
      <div className={`message${isCurrentUser ? ' self' : ''}`}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
          <Avatar
            userId={senderId}
            username={senderName}
            size={32}
            cacheEnabled={cacheEnabled}
            getCachedFile={getCachedFile}
            saveToCache={saveToCache}
          />
          <div style={{ flex: 1 }}>
            <strong>{senderName}</strong>
            <div className="message-content">
              {renderContentWithMentions(msg.content)}
            </div>
          </div>
        </div>

        {files.length > 0 && (
          <div className="message-files">
            {files.map(fileId => (
              <FileItem
                key={fileId}
                fileId={fileId}
                fileMeta={fileMeta.get(fileId) || {}}
                userId={user?.id}
                cacheEnabled={cacheEnabled}
                getCachedFile={getCachedFile}
                saveToCache={saveToCache}
              />
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="message-controls">
            {isCurrentUser && (
              <button
                onClick={async () => {
                  if (!confirm('Удалить сообщение? Это действие нельзя отменить.'))
                    return;
                  try {
                    const resp = await fetch(
                      `/api/messenger/delete-message/${msg.id}`,
                      {
                        method: 'DELETE',
                        headers: { 'x-user-id': user.id }
                      }
                    );
                    const j = await resp.json();
                    if (resp.ok && j.success) {
                      if (typeof onDelete === 'function')
                        onDelete(msg.id, j.storageInfo);
                    } else {
                      alert(j.message || 'Не удалось удалить сообщение');
                    }
                  } catch (e) {
                    console.error('delete message error', e);
                    alert('Ошибка удаления сообщения');
                  }
                }}
              >🗑️
              </button>
            )}
            <ForwardButton msg={msg} wsRef={wsRef} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'flex-end' }}>
            <small>{formatTime(msg.created_at)}</small>
          </div>
        </div>
      </div>
    </>
  );
}