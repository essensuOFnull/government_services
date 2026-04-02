import React from 'react';
import FileItem from './FileItem';
import Avatar from './Avatar';
import { useAuthContext } from '../contexts/AuthContext';
import ForwardButton from './ForwardButton';
import FileViewer from './FileViewer';
import { useWindowsManager } from '../hooks/useWindowsManager';

export default function Message({
  msg,
  fileMeta = new Map(),
  users = new Map(),
  onDelete,
  wsRef,
  cacheEnabled,
  getCachedFile,
  saveToCache,
  isPending = false,
  progress = { text: 100, files: {} },
  pendingFiles = [],
  status = 'sent',
  onRetry,
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
    const parts = content.split(/(@[a-zA-Z0-9_]+)/g);
    return parts.map((part, idx) => {
      if (/^@[a-zA-Z0-9_]+$/.test(part)) {
        const username = part.slice(1);
        return (
          <a
            key={idx}
            href="#"
            className="mention-link"
            onClick={e => {
              e.preventDefault();
              window.dispatchEvent(new CustomEvent('openUserProfile', {
                detail: { username }
              }));
            }}
          >
            {part}
          </a>
        );
      }
      return part;
    });
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

  const { openWindow} = useWindowsManager();
  const handleAvatarClick = (userId, avatarUrl) => {
    openWindow({
      title: `Аватар пользователя ${senderName}`,
      children: (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px' }}>
          <img
            src={avatarUrl}
            alt={senderName}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
            }}
          />
        </div>
      ),
    });
  };
  return (
    <>
      <hr style={{ width: '100%' }} />
      <div className={`message${isCurrentUser ? ' self' : ''}`}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
          <Avatar
            userId={senderId}
            username={senderName}
            size={64}
            cacheEnabled={cacheEnabled}
            getCachedFile={getCachedFile}
            saveToCache={saveToCache}
            onClick={handleAvatarClick}
          />
          <div style={{ flex: 1 }}>
            <strong>{senderName}</strong>
            <div className="message-content">
              {renderContentWithMentions(msg.content)}
            </div>

            {isPending && progress.text < 100 && (
              <div className="progress-indicator segmented">
                <span className="progress-indicator-bar" style={{ width: `${progress.text}%` }} />
              </div>
            )}

            {isPending && pendingFiles.length > 0 && (
              <div className="pending-files">
                {pendingFiles.map((f, idx) => (
                  <div key={idx} className="pending-file">
                    <span>{f.file.name}</span>
                    <div className="progress-indicator segmented">
                      <span className="progress-indicator-bar" style={{ width: `${progress.files[idx]}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isPending && status === 'awaiting_confirm' && (
              <div className="sending-indicator">Отправляется...</div>
            )}

            {isPending && status === 'error' && (
              <div className="error-message">
                <span>Ошибка: {msg.error}</span>
                <button onClick={onRetry}>Повторить</button>
              </div>
            )}
          </div>
        </div>

        {files.length > 0 && (
          <div className="message-files">
            {!isPending && (msg.file_ids || []).length > 0 && (
              <div className="message-files">
                {msg.file_ids.map(fileId => (
                  <FileItem
                    key={fileId}
                    fileId={fileId}
                    fileMeta={fileMeta.get(fileId) || {}}
                    userId={senderId}
                    cacheEnabled={cacheEnabled}
                    getCachedFile={getCachedFile}
                    saveToCache={saveToCache}
                  />
                ))}
              </div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="message-controls">
            {isCurrentUser && !isPending && (
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
            {!isPending && <ForwardButton msg={msg} wsRef={wsRef} />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'flex-end' }}>
            <small>{formatTime(msg.created_at)}</small>
          </div>
        </div>
      </div>
    </>
  );
}