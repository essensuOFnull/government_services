import React, { useState, useRef } from 'react';
import { useAuthContext } from '../contexts/AuthContext';
import { useWindowsManager } from '../hooks/useWindowsManager';
import Avatar from './Avatar';

const ProfileWindow = ({}) => {
  const { 
    user, 
    logout, 
    changeUsername, 
    changePassword,
    loading,
    updateUser
  } = useAuthContext();
  const { closeAllWindows } = useWindowsManager();
  
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarRefresh, setAvatarRefresh] = useState(0);
  const fileInputRef = useRef(null);

  const handleUsernameChange = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    
    if (!newUsername.trim()) {
      setError('Введите новое имя пользователя');
      return;
    }

    const result = await changeUsername(newUsername);
    if (result.success) {
      setMessage('Имя пользователя изменено');
      setNewUsername('');
    } else {
      setError(result.message);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    
    if (newPassword.length < 8) {
      setError('Минимум 8 символов');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    const result = await changePassword(newPassword);
    if (result.success) {
      setMessage('Пароль изменен');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setError(result.message);
    }
  };

  const handleLogout = async () => {
    await logout();
    closeAllWindows();
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE = 64 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setError(`Размер аватарки не должен превышать ${MAX_SIZE / (1024 * 1024)}MB`);
      return;
    }

    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml'];
    if (!allowedMimes.includes(file.type)) {
      setError('Поддерживаются только PNG, JPEG, GIF или SVG');
      return;
    }

    setAvatarLoading(true);
    setMessage('');
    setError('');

    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await fetch('/api/messenger/avatar/upload', {
        method: 'POST',
        headers: { 'x-user-id': user.id },
        body: formData
      });

      const json = await response.json();
      if (response.ok && json.success) {
        setMessage('Аватарка загружена успешно');
        if (updateUser) updateUser({ ...user, avatar_file_id: json.file.id });
      } else {
        setError(json.message || 'Ошибка загрузки аватарки');
      }
    } catch (err) {
      console.error('Avatar upload error:', err);
      setError('Ошибка загрузки аватарки');
    } finally {
      setAvatarLoading(false);
      e.target.value = '';
    }
  };

  const handleAvatarDelete = async () => {
    if (!confirm('Вы уверены? Аватарка будет удалена навсегда.')) return;

    setAvatarLoading(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/messenger/avatar', {
        method: 'DELETE',
        headers: { 'x-user-id': user.id }
      });

      const json = await response.json();
      if (response.ok && json.success) {
        setMessage('Аватарка удалена');
        if (updateUser) updateUser({ ...user, avatar_file_id: null });
      } else {
        setError(json.message || 'Ошибка удаления аватарки');
      }
    } catch (err) {
      console.error('Avatar delete error:', err);
      setError('Ошибка удаления аватарки');
    } finally {
      setAvatarLoading(false);
    }
  };

  if (!user) {
    return <div>Не авторизован</div>;
  }

  const formatStorage = (bytes) => {
    const gb = bytes / (1024 ** 3);
    return `${gb.toFixed(1)} ГБ`;
  };

  const getRoleName = (role) => {
    switch(role) {
      case 'guest': return 'Гость';
      case 'sponsor': return 'Спонсор';
      case 'member': return 'Член Подбредья';
      default: return role;
    }
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <p><strong>Профиль пользователя</strong></p>
      
      <div className='window' style={{padding:'16px'}}>
        <div style={{ marginBottom: '16px' }}>
          <Avatar 
            userId={user.id} 
            username={user.username} 
            size={80}
          />
        </div>
        <p><strong>ID:</strong> {user.id}</p>
        <p><strong>Имя пользователя:</strong> {user.username}</p>
        <p><strong>Роль:</strong> {getRoleName(user.role)}</p>
        <p><strong>Лимит хранилища:</strong> {formatStorage(user.storageLimit)}</p>
        <p><strong>Дата регистрации:</strong> {new Date(user.createdAt).toLocaleDateString('ru-RU')}</p>
      </div>

      {message && (
        <div style={{ 
          color: '#107c10', 
        }}>
          {message}
        </div>
      )}
      
      {error && (
        <div style={{ 
          color: '#d13438', 
        }}>
          {error}
        </div>
      )}

      <div className='window' style={{padding:'16px'}}>
        <p><strong>Аватарка профиля</strong></p>
        <div style={{ marginBottom: '12px' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/svg+xml"
            onChange={handleAvatarUpload}
            style={{ display: 'none' }}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarLoading || loading}
          >
            📷 Загрузить аватарку
          </button>
        </div>
        {user.avatar_file_id && (
          <button 
            onClick={handleAvatarDelete}
            disabled={avatarLoading || loading}
            style={{ marginTop: '8px' }}
          >
            🗑️ Удалить аватарку
          </button>
        )}
      </div>

      <div className='window' style={{padding:'16px'}}>
        <p><strong>Сменить имя пользователя</strong></p>
        <form onSubmit={handleUsernameChange}>
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="Новое имя пользователя"
            disabled={loading}
          />
          <br/><br/>
          <button 
            type="submit" 
            disabled={loading}
          >
            Сменить
          </button>
        </form>
      </div>
      <div className='window' style={{padding:'16px'}}>
        <p><strong>Сменить пароль</strong></p>
        <form onSubmit={handlePasswordChange}>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Новый пароль"
            disabled={loading}
          />
          <br/><br/>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Подтвердите пароль"
            disabled={loading}
          />
          <br/><br/>
          <button 
            type="submit"
            disabled={loading}
          >
            Сменить
          </button>
        </form>
      </div>
      <br/>
      <button 
        onClick={handleLogout}
        disabled={loading}
      >
        Выйти из аккаунта
      </button>
    </div>
  );
};

export default ProfileWindow;