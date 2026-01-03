import React, { useState } from 'react';
import api from '../utils/api';

export default function UserSearch({ onUserSelected }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const user = await api.findUserByUsername(query.trim());
      if (user && user.id) {
        setResult(user);
      } else {
        setError('Пользователь не найден');
      }
    } catch (err) {
      setError('Ошибка поиска пользователя');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="user-search">
      <form onSubmit={handleSearch}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Введите username..."
        />
        <button type="submit" disabled={loading || !query.trim()}>Найти</button>
      </form>
      {loading && <div>Поиск...</div>}
      {error && <div className="error">{error}</div>}
      {result && (
        <div className="user-result">
          <span>@{result.username}</span>
          <button onClick={() => onUserSelected(result)}>Открыть чат</button>
        </div>
      )}
    </div>
  );
}
