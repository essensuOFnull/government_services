import React, { useState } from 'react';
import { useAuthContext } from './AuthContext';

const Profile = () => {
  const { 
    user, 
    logout, 
    changeUsername, 
    changePassword,
    loading 
  } = useAuthContext();
  
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

  if (!user) {
    return <div>Не авторизован</div>;
  }

  const formatStorage = (bytes) => {
    const gb = bytes / (1024 ** 3);
    return `${gb.toFixed(1)} ГБ`;
  };

  return (
    <div>
      <h2>Профиль</h2>
      
      <div>
        <p><strong>ID:</strong> {user.userId}</p>
        <p><strong>Имя пользователя:</strong> {user.username}</p>
        <p><strong>Роль:</strong> {user.role === 'guest' ? 'Гость' : user.role}</p>
        <p><strong>Лимит хранилища:</strong> {formatStorage(user.storageLimit)}</p>
        <p><strong>Дата регистрации:</strong> {new Date(user.createdAt).toLocaleDateString()}</p>
      </div>

      {message && <div style={{ color: 'green' }}>{message}</div>}
      {error && <div style={{ color: 'red' }}>{error}</div>}

      <div style={{ marginTop: '20px' }}>
        <h3>Сменить имя пользователя</h3>
        <form onSubmit={handleUsernameChange}>
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="Новое имя пользователя"
            disabled={loading}
          />
          <button type="submit" disabled={loading}>
            Сменить
          </button>
        </form>
      </div>

      <div style={{ marginTop: '20px' }}>
        <h3>Сменить пароль</h3>
        <form onSubmit={handlePasswordChange}>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Новый пароль"
            disabled={loading}
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Подтвердите пароль"
            disabled={loading}
          />
          <button type="submit" disabled={loading}>
            Сменить пароль
          </button>
        </form>
      </div>

      <div style={{ marginTop: '20px' }}>
        <button onClick={logout} disabled={loading}>
          Выйти
        </button>
      </div>
    </div>
  );
};

export default Profile;