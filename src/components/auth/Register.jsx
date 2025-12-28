import React, { useState } from 'react';
import { useAuthContext } from './AuthContext';

const Register = () => {
  const { register, error, loading } = useAuthContext();
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

  return (
    <div>
      <h2>Регистрация</h2>
      <p>Роль по умолчанию: Гость (10 ГБ хранилища)</p>
      
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
            placeholder="3-20 символов"
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
            placeholder="Минимум 8 символов"
          />
          <small>Заглавные и строчные буквы, цифры</small>
        </div>
        <div>
          <label>Подтвердите пароль:</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Регистрация...' : 'Зарегистрироваться'}
        </button>
      </form>
    </div>
  );
};

export default Register;