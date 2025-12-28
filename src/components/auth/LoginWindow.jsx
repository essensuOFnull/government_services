import React, { useState } from 'react';
import { useAuthContext } from './AuthContext';

const LoginWindow = ({ onRegisterClick }) => {
  const { login, error, loading } = useAuthContext();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    
    if (!username.trim() || !password.trim()) {
      setLocalError('Заполните все поля');
      return;
    }

    const result = await login(username, password);
    if (!result.success) {
      setLocalError(result.message);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ marginBottom: '20px' }}>Вход</h2>
      {(error || localError) && (
        <div style={{ 
          color: '#d13438', 
          marginBottom: '10px',
          padding: '10px',
          backgroundColor: '#fde7e9',
          borderRadius: '4px'
        }}>
          {error || localError}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Имя пользователя:</label>
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
          />
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Пароль:</label>
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
          />
        </div>
        <button 
          type="submit"
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: '#0078d4',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginBottom: '15px'
          }}
          disabled={loading}
        >
          {loading ? 'Вход...' : 'Войти'}
        </button>
        
        <div style={{ textAlign: 'center' }}>
          <span style={{ marginRight: '5px' }}>Нет аккаунта?</span>
          <button 
            type="button"
            onClick={onRegisterClick}
            style={{
              background: 'none',
              border: 'none',
              color: '#0078d4',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Зарегистрироваться
          </button>
        </div>
      </form>
    </div>
  );
};

export default LoginWindow;