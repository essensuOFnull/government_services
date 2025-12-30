import React, { useState } from 'react';
import { useAuthContext } from './AuthContext';
import { useWindowsManager } from '../../hooks/useWindowsManager';

const ProfileWindow = ({ onClose }) => {
  const { 
    user, 
    logout, 
    changeUsername, 
    changePassword,
    loading 
  } = useAuthContext();
  const { closeAllWindows } = useWindowsManager();
  
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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
        <p><strong>ID:</strong> {user.userId}</p>
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