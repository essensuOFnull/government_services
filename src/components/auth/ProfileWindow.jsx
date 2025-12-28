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
    <div style={{ padding: '20px' }}>
      <h2 style={{ marginBottom: '20px' }}>Профиль пользователя</h2>
      
      <div style={{ marginBottom: '30px', backgroundColor: '#f3f2f1', padding: '15px', borderRadius: '4px' }}>
        <p><strong>ID:</strong> {user.userId}</p>
        <p><strong>Имя пользователя:</strong> {user.username}</p>
        <p><strong>Роль:</strong> {getRoleName(user.role)}</p>
        <p><strong>Лимит хранилища:</strong> {formatStorage(user.storageLimit)}</p>
        <p><strong>Дата регистрации:</strong> {new Date(user.createdAt).toLocaleDateString('ru-RU')}</p>
      </div>

      {message && (
        <div style={{ 
          color: '#107c10', 
          marginBottom: '15px',
          padding: '10px',
          backgroundColor: '#dff6dd',
          borderRadius: '4px'
        }}>
          {message}
        </div>
      )}
      
      {error && (
        <div style={{ 
          color: '#d13438', 
          marginBottom: '15px',
          padding: '10px',
          backgroundColor: '#fde7e9',
          borderRadius: '4px'
        }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: '30px' }}>
        <h3 style={{ marginBottom: '15px' }}>Сменить имя пользователя</h3>
        <form onSubmit={handleUsernameChange}>
          <div style={{ marginBottom: '10px' }}>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="Новое имя пользователя"
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                boxSizing: 'border-box'
              }}
              disabled={loading}
            />
          </div>
          <button 
            type="submit" 
            style={{
              padding: '8px 16px',
              backgroundColor: '#0078d4',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
            disabled={loading}
          >
            Сменить
          </button>
        </form>
      </div>

      <div style={{ marginBottom: '30px' }}>
        <h3 style={{ marginBottom: '15px' }}>Сменить пароль</h3>
        <form onSubmit={handlePasswordChange}>
          <div style={{ marginBottom: '10px' }}>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Новый пароль"
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                boxSizing: 'border-box',
                marginBottom: '10px'
              }}
              disabled={loading}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Подтвердите пароль"
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                boxSizing: 'border-box'
              }}
              disabled={loading}
            />
          </div>
          <button 
            type="submit"
            style={{
              padding: '8px 16px',
              backgroundColor: '#0078d4',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
            disabled={loading}
          >
            Сменить пароль
          </button>
        </form>
      </div>

      <div>
        <button 
          onClick={handleLogout}
          style={{
            padding: '10px 20px',
            backgroundColor: '#d13438',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            width: '100%'
          }}
          disabled={loading}
        >
          Выйти из аккаунта
        </button>
      </div>
    </div>
  );
};

export default ProfileWindow;