import React, { useState, useEffect } from 'react';

export default function GlobalPasswordPrompt({ onSubmit, error, attemptsLeft, blockedUntil, isLoading }) {
  const [password, setPassword] = useState('');
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (blockedUntil) {
      const updateTimer = () => {
        const remaining = Math.max(0, Math.floor((new Date(blockedUntil) - Date.now()) / 1000));
        setTimeLeft(remaining);
      };
      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    } else {
      setTimeLeft(null);
    }
  }, [blockedUntil]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password.trim()) {
      onSubmit(password);
    }
  };

  const isBlocked = blockedUntil && new Date(blockedUntil) > Date.now();

  return (
    <div className="window" style={{ width: '400px', margin: 'auto', marginTop: '100px' }}>
      <div className="window-body">
        <form onSubmit={handleSubmit}>
          <p><strong>Введите глобальный пароль доступа</strong></p>
          {error && (
            <div style={{ color: '#d13438', marginBottom: '10px' }}>
              {error}
            </div>
          )}
          {attemptsLeft !== null && attemptsLeft > 0 && !isBlocked && (
            <div style={{ color: '#ff8c00', marginBottom: '10px' }}>
              Осталось попыток: {attemptsLeft}
            </div>
          )}
          {timeLeft !== null && timeLeft > 0 && (
            <div style={{ color: '#ff8c00', marginBottom: '10px' }}>
              Попробуйте через {timeLeft} секунд
            </div>
          )}
          <div className="field-row-stacked">
            <label>Пароль:</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading || isBlocked}
              autoFocus
            />
          </div>
          <br />
          <button
            type="submit"
            disabled={isLoading || isBlocked}
          >
            {isLoading ? 'Проверка...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}