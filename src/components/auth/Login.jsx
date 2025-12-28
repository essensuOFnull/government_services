import React, { useState } from 'react';
import { useAuthContext } from './AuthContext';

const Login = () => {
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

  if (loading) {
    return <div>Загрузка...</div>;
  }

  return (
    <div>
      <h2>Вход</h2>
      {(error || localError) && (
        <div style={{ color: 'red', marginBottom: '10px' }}>
          {error || localError}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div>
          <label>Имя пользователя:</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        <div>
          <label>Пароль:</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Вход...' : 'Войти'}
        </button>
      </form>
    </div>
  );
};

export default Login;