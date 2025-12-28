import React, { useState } from 'react';
import { useAuthContext } from './AuthContext';
import { useWindowsManager } from '../../hooks/useWindowsManager';
import LoginWindow from './LoginWindow';

const RegisterWindow = ({ onClose }) => {
  const { register, error, loading } = useAuthContext();
  const { openWindow, closeWindow } = useWindowsManager();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const validatePassword = (pass) => {
    if (pass.length < 8) return 'Минимум 8 символов';
    if (!/[A-Z]/.test(pass)) return 'Добавьте заглавную букву';
    if (!/[a-z]/.test(pass)) return 'Добавьте строчную букву';
    if (!/\d/.test(pass)) return 'Добавьте цифру';
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    
    if (!username.trim() || !password || !confirmPassword) {
      setLocalError('Заполните все поля');
      return;
    }

    if (password !== confirmPassword) {
      setLocalError('Пароли не совпадают');
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setLocalError(passwordError);
      return;
    }

    if (username.length < 3 || username.length > 20) {
      setLocalError('Имя пользователя: 3-20 символов');
      return;
    }

    if (!/^[a-zA-Z0-9_\-]+$/.test(username)) {
      setLocalError('Только буквы, цифры, дефисы и подчеркивания');
      return;
    }

    const result = await register(username, password);
    if (!result.success) {
      setLocalError(result.message);
    }
  };

  const handleLoginClick = () => {
    if (onClose) onClose();
    openWindow({
      title: 'Вход',
      children: <LoginWindow />,
    });
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ marginBottom: '10px' }}>Регистрация</h2>
      <p style={{ color: '#666', marginBottom: '20px', fontSize: '14px' }}>
        Роль по умолчанию: <strong>Гость</strong> (10 ГБ хранилища)
      </p>
      
      {(error || localError) && (
        <div style={{ 
          color: '#d13438', 
          marginBottom: '10px',
          padding: '10px',
          backgroundColor: '#fde7e9',
          borderRadius: '4px',
          fontSize: '14px'
        }}>
          {error || localError}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            Имя пользователя:
            <span style={{ fontSize: '12px', color: '#666', marginLeft: '5px' }}>
              (3-20 символов)
            </span>
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              boxSizing: 'border-box'
            }}
            required
            disabled={loading}
            placeholder="Введите имя пользователя"
          />
        </div>
        
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            Пароль:
            <span style={{ fontSize: '12px', color: '#666', marginLeft: '5px' }}>
              (мин. 8 символов, буквы и цифры)
            </span>
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              boxSizing: 'border-box'
            }}
            required
            disabled={loading}
            placeholder="Введите пароль"
          />
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            Подтвердите пароль:
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              boxSizing: 'border-box'
            }}
            required
            disabled={loading}
            placeholder="Повторите пароль"
          />
        </div>
        
        <button 
          type="submit"
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: '#107c10',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginBottom: '15px'
          }}
          disabled={loading}
        >
          {loading ? 'Регистрация...' : 'Зарегистрироваться'}
        </button>
        
        <div style={{ textAlign: 'center' }}>
          <span style={{ marginRight: '5px' }}>Уже есть аккаунт?</span>
          <button 
            type="button"
            onClick={handleLoginClick}
            style={{
              background: 'none',
              border: 'none',
              color: '#0078d4',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Войти
          </button>
        </div>
      </form>
    </div>
  );
};

export default RegisterWindow;